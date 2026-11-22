import json
import os
import time

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from prompts import EXTRACT, NOTICE, ESCALATE

client = boto3.client("bedrock-runtime", config=Config(connect_timeout=1, read_timeout=4,
                      retries={"total_max_attempts": 1}))


def extract_json(text):
    decoder = json.JSONDecoder()
    for start, char in enumerate(text):
        if char == "{":
            try:
                value, _ = decoder.raw_decode(text[start:])
                if isinstance(value, dict):
                    return value
            except ValueError:
                continue
    return {}


def converse(prompt, content):
    for attempt in range(2):
        try:
            result = client.converse(modelId=os.environ["MODEL_ID"], system=[{"text": prompt}],
                                     messages=[{"role": "user", "content": content}],
                                     inferenceConfig={"temperature": 0, "maxTokens": 250})
            blocks = result["output"]["message"]["content"]
            return extract_json(" ".join(b.get("text", "") for b in blocks))
        except ClientError as error:
            if attempt or error.response["Error"]["Code"] not in {"ThrottlingException", "ServiceUnavailableException"}:
                break
            time.sleep(0.15)
        except BotoCoreError:
            break
    return {}


def read_image(data, kind):
    result = converse(EXTRACT, [{"image": {"format": kind, "source": {"bytes": data}}},
                                {"text": "Transcribe the sender and a short excerpt."}])
    return {k: v[:400].strip() if isinstance(v := result.get(k), str) else ""
            for k in ("brand", "header", "excerpt")}


def sentence(prompt, fallback):
    value = converse(prompt, [{"text": "Draft the requested sentence."}]).get("sentence")
    if isinstance(value, str) and 10 <= len(value) <= 350 and value.isascii():
        return value.strip()
    return fallback


def notice(row):
    request = sentence(NOTICE, "I withdraw any consent previously given for direct marketing.")
    return (f"To the Grievance Officer, {row['company']['legal_name']}\n\n"
            f"Subject: Withdrawal of marketing consent and request for erasure — {row['request_id']}\n\n"
            f"{request} Please cease promotional processing associated with {row['identifier']} "
            "and erase personal data no longer necessary for the specified purpose, subject to legally required retention. "
            "Please identify any retained categories and the reason for retention.\n\n"
            "This request refers to sections 6(4) and 12(3) of the Digital Personal Data Protection Act, "
            "2023 to the extent in force and applicable. I request a written update within seven days.\n\n"
            f"{row['name']}\n{row['email']}")


def complaint(row):
    prayer = sentence(ESCALATE, "I request review after exhaustion of the respondent's grievance process.")
    return (f"BEFORE THE DATA PROTECTION BOARD OF INDIA\nComplaint draft for citizen review\n\n"
            f"Complainant: {row['name']} ({row['email']})\nRespondent: {row['company']['legal_name']} "
            f"({row['company']['email']})\nReference: {row['request_id']}\n\n"
            f"Evidence recorded on {row['created_at']}: {row['evidence']}\n"
            f"Evidence digest: {row.get('digest') or 'Company search'}\n"
            f"Reviewed notice:\n{row['notice']}\n\nSES acceptance: {row['sent_at']} / {row['ses_message_id']}\n"
            f"Envelope recipient: {row['recipient']}\nRequested follow-up: {row['compliance_deadline']}\n"
            f"Demonstration record: {row['safe_mode']}. Simulated expiry: {row.get('simulated', False)}.\n"
            "No resolution was recorded in this tracker when the dossier was prepared. "
            "The sender must verify delivery, actual responses, commencement and exhaustion before filing.\n\n"
            f"Prayer: {prayer} Subject to sections 13(3) and 27(1)(b), I seek inquiry and appropriate relief "
            "concerning my erasure request. I request consideration of section 33 if a significant breach is established.\n\n"
            "Verification: I declare that, after checking the evidence and correspondence, the facts stated are "
            "true to the best of my knowledge.\nPlace and date: __________________\nSignature: __________________")
