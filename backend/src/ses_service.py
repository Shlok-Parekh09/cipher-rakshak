import os
from email.message import EmailMessage
from html import escape

import boto3
from botocore.config import Config

ses = boto3.client("ses", config=Config(connect_timeout=2, read_timeout=5, retries={"total_max_attempts": 1}))


def send(row):
    mail = EmailMessage()
    mail["From"] = os.environ["SENDER"]
    mail["To"] = row["recipient"]
    if not row["safe_mode"]:
        mail["Cc"] = row["email"]
        mail["Reply-To"] = row["email"]
    prefix = "[Demonstration] " if row["safe_mode"] else ""
    mail["Subject"] = f"{prefix}Privacy request {row['request_id']}"
    mail.set_content(row["notice"])
    mail.add_alternative("<html><body><pre style='white-space:pre-wrap'>" +
                         escape(row["notice"]) + "</pre></body></html>", subtype="html")
    return ses.send_raw_email(RawMessage={"Data": mail.as_bytes()})["MessageId"]
