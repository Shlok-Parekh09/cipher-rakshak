import base64
import binascii
import hashlib
import json
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from botocore.exceptions import BotoCoreError, ClientError

import bedrock_service as ai
import db_service as db
import ses_service as mail


class Fault(Exception):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)


def field(data, key, maximum):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise Fault(400, f"Enter a valid {key} (up to {maximum} characters).")
    return value.strip()


def analyze(data, owner, email):
    name = field(data, "name", 100)
    identifier = field(data, "identifier", 160)
    company = None
    if data.get("company_id"):
        company = db.directory.get_item(Key={"company_id": field(data, "company_id", 64)}).get("Item")
        if not company:
            raise Fault(404, "Company is absent from the directory.")
    evidence = "Company selected by citizen."
    digest = header = ""
    if data.get("image"):
        binary = base64.b64decode(field(data, "image", 1900000), validate=True)
        kind = "jpeg" if binary.startswith(b"\xff\xd8\xff") else "png" if binary.startswith(b"\x89PNG\r\n\x1a\n") else None
        if not kind:
            raise Fault(415, "Use a JPEG or PNG screenshot.")
        digest = hashlib.sha256(binary).hexdigest()
        parsed = ai.read_image(binary, kind)
        header = parsed["header"]
        evidence = parsed["excerpt"] or "Screenshot supplied. Transcription unavailable."
        company = company or db.match(parsed["brand"], header)
    if not company:
        raise Fault(422, "Select the company in the directory to confirm the sender.")
    row = dict(request_id="CRK-IND-" + uuid.uuid4().hex.upper(), owner=owner, email=email,
               name=name, identifier=identifier, company=company, status="DRAFT", evidence=evidence,
               digest=digest, header=header, created_at=db.now(), expires_at=int(time.time()) + 365 * 86400)
    row["notice"] = ai.notice(row)
    db.requests.put_item(Item=row, ConditionExpression="attribute_not_exists(request_id)")
    return row


def dispatch(row, data):
    if row["status"] in {"SENT", "BREACHED", "RESOLVED", "ESCALATED_TO_DPBI"}:
        return row
    if row["status"] != "DRAFT":
        raise Fault(409, "Dispatch is pending reconciliation. Check the tracker before retrying.")
    safe = data.get("safe_mode", True)
    if type(safe) is not bool:
        raise Fault(400, "safe_mode must be a boolean.")
    if not safe and (os.environ["ALLOW_LIVE"] != "true" or not row["company"].get("live_ready")):
        raise Fault(403, "Live dispatch is disabled for this deployment or contact.")
    recipient = os.environ["DEMO_RECIPIENT"] if safe else row["company"]["email"]
    if safe and data.get("demo_recipient", recipient) != recipient:
        raise Fault(400, "Select the sandbox mailbox configured for this deployment.")
    row = db.update(row, "DISPATCHING", recipient=recipient, safe_mode=safe, notice=field(data, "notice", 12000))
    try:
        receipt = mail.send(row)
    except ClientError as exc:
        if exc.response["ResponseMetadata"]["HTTPStatusCode"] < 500:
            db.update(row, "DRAFT")
            raise Fault(422, "SES declined the message. Check regional sender and recipient verification.") from exc
        raise
    sent = datetime.now(timezone.utc)
    return db.update(row, "SENT", ses_message_id=receipt, sent_at=sent.isoformat(timespec="seconds"),
                     compliance_deadline=(sent + timedelta(days=7)).isoformat(timespec="seconds"))


def route(event, data):
    key = event.get("routeKey")
    query = event.get("queryStringParameters") or {}
    if key == "GET /api/health":
        return {"status": "ok", "live_enabled": os.environ["ALLOW_LIVE"] == "true"}
    if key == "GET /api/directory":
        return {"items": db.companies(query.get("q", "")[:100])}
    claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    owner, email = claims.get("sub"), claims.get("email")
    if not owner or not email or str(claims.get("email_verified")).lower() != "true" or claims.get("token_use") != "id":
        raise Fault(401, "Sign in with a verified email account.")
    if key == "POST /api/analyze":
        return analyze(data, owner, email)
    if key == "GET /api/requests":
        cursor = json.loads(query["cursor"]) if query.get("cursor") else None
        if cursor is not None and (not isinstance(cursor, dict) or cursor.get("owner") != owner or
                                   set(cursor) != {"owner", "request_id", "created_at"}):
            raise Fault(400, "Invalid tracker cursor.")
        return db.tracked(owner, cursor)
    rid = (event.get("pathParameters") or {}).get("request_id") or field(data, "request_id", 64)
    row = db.get(owner, rid)
    if not row:
        raise Fault(404, "Request unavailable.")
    if key == "POST /api/dispatch":
        return dispatch(row, data)
    if key == "PATCH /api/requests/{request_id}":
        if data.get("action") == "simulate" and row.get("safe_mode") and row["status"] == "SENT":
            return db.update(row, "BREACHED", simulated=True)
        if data.get("action") == "resolve" and row["status"] in {"SENT", "BREACHED", "ESCALATED_TO_DPBI"}:
            return db.update(row, "RESOLVED")
        raise Fault(409, "This update is unavailable for this record.")
    if key == "POST /api/escalate":
        if row["status"] == "ESCALATED_TO_DPBI":
            return row
        if db.evaluated(row)["status"] != "BREACHED":
            raise Fault(409, "The follow-up period is still open or the request is resolved.")
        return db.update(row, "ESCALATED_TO_DPBI", complaint=ai.complaint(row))
    raise Fault(404, "Unknown route.")


def handler(event, context):
    start = time.monotonic()
    status = 200
    try:
        body = event.get("body") or "{}"
        if len(body) > 2600000:
            raise Fault(413, "Compress the screenshot before uploading.")
        if event.get("isBase64Encoded"):
            body = base64.b64decode(body, validate=True)
        data = json.loads(body)
        if not isinstance(data, dict):
            raise Fault(400, "Expected a JSON object.")
        result = route(event, data)
    except Fault as exc:
        status, result = exc.status, {"error": str(exc)}
    except (ValueError, binascii.Error, RecursionError):
        status, result = 400, {"error": "Invalid JSON or base64 encoding."}
    except ClientError as exc:
        conflict = exc.response["Error"]["Code"] == "ConditionalCheckFailedException"
        status = 409 if conflict else 503
        result = {"error": "Record changed. Refresh the tracker." if conflict else "AWS operation unavailable. Check the tracker."}
    except BotoCoreError:
        status, result = 503, {"error": "Connection interrupted. Check the tracker."}
    return {"statusCode": status, "headers": {"content-type": "application/json", "cache-control": "no-store",
            "access-control-allow-origin": os.environ["ORIGIN"], "vary": "Origin"},
            "body": json.dumps({**result, "elapsed_ms": int((time.monotonic()-start)*1000)},
                               default=lambda value: int(value) if isinstance(value, Decimal) else str(value))}
