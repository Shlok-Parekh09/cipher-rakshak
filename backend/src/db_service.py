import os
import re
from datetime import datetime, timezone
from difflib import SequenceMatcher

import boto3
from boto3.dynamodb.conditions import Key

db = boto3.resource("dynamodb")
directory = db.Table(os.environ["DIRECTORY_TABLE"])
requests = db.Table(os.environ["REQUESTS_TABLE"])


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def pages(call, **args):
    while True:
        page = call(**args)
        yield from page.get("Items", [])
        if "LastEvaluatedKey" not in page:
            return
        args["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def companies(query=""):
    term = query.strip().casefold()
    return sorted((c for c in pages(directory.scan) if any(term in str(c[k]).casefold()
                  for k in ("brand", "legal_name", "headers", "sector"))), key=lambda c: c["brand"])


def match(brand, header):
    parts = re.split(r"[^A-Z0-9]+", header.upper())
    ranked = []
    for company in companies():
        score = max(SequenceMatcher(None, brand.casefold(), company[k].casefold()).ratio()
                    for k in ("brand", "legal_name"))
        if set(parts) & set(company["headers"]):
            score = 1
        ranked.append((score, company))
    ranked.sort(key=lambda pair: pair[0], reverse=True)
    if ranked and ranked[0][0] >= 0.80 and (len(ranked) == 1 or ranked[0][0] - ranked[1][0] >= 0.10):
        return ranked[0][1]
    return None


def get(owner, rid):
    row = requests.get_item(Key={"request_id": rid}, ConsistentRead=True).get("Item")
    return row if row and row["owner"] == owner else None


def update(row, status, **fields):
    fields.update(status=status)
    names = {f"#k{i}": k for i, k in enumerate(fields)}
    values = {f":v{i}": v for i, v in enumerate(fields.values())}
    return requests.update_item(Key={"request_id": row["request_id"]},
        ConditionExpression="#state = :old AND #owner = :owner",
        UpdateExpression="SET " + ", ".join(f"{k} = :v{i}" for i, k in enumerate(names)),
        ExpressionAttributeNames={**names, "#state": "status", "#owner": "owner"},
        ExpressionAttributeValues={**values, ":old": row["status"], ":owner": row["owner"]},
        ReturnValues="ALL_NEW")["Attributes"]


def evaluated(row):
    if row["status"] == "SENT" and row["compliance_deadline"] <= now():
        row = dict(row, status="BREACHED")
    return row


def tracked(owner, cursor=None):
    args = {"IndexName": "OwnerCreated", "KeyConditionExpression": Key("owner").eq(owner),
            "ScanIndexForward": False, "Limit": 25}
    if cursor:
        args["ExclusiveStartKey"] = cursor
    page = requests.query(**args)
    return {"items": [evaluated(i) for i in page["Items"]], "cursor": page.get("LastEvaluatedKey")}
