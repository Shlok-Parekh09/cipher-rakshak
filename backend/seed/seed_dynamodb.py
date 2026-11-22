"""Load the curated company directory into the deployed CipherRakshak DynamoDB table."""
import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse


def read_directory():
    records = json.loads(Path(__file__).with_name("seed_directory.json").read_text(encoding="utf-8"))
    ids = set()
    headers = set()
    for company in records:
        key = company["company_id"]
        if key in ids or not re.fullmatch(r"[a-z0-9-]+", key):
            raise ValueError(f"Invalid or duplicate company identifier: {key}")
        ids.add(key)
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", company["email"]):
            raise ValueError(f"Invalid contact address for {key}")
        source = urlparse(company["source_url"])
        if source.scheme != "https" or not source.netloc or not company["legal_name"].strip():
            raise ValueError(f"Incomplete source or entity name for {key}")
        if type(company["live_ready"]) is not bool:
            raise ValueError(f"Invalid dispatch eligibility for {key}")
        for header in company["headers"]:
            if header in headers or not re.fullmatch(r"[A-Z0-9]{1,6}", header):
                raise ValueError(f"Ambiguous or invalid header {header}")
            headers.add(header)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--table", default=os.getenv("DIRECTORY_TABLE", "CipherRakshak_Directory"))
    parser.add_argument("--region", help="AWS region of the deployed SAM stack")
    parser.add_argument("--check", action="store_true", help="Validate locally without contacting AWS")
    args = parser.parse_args()
    records = read_directory()
    if args.check:
        print(f"Validated {len(records)} company records.")
        return

    import boto3

    table = boto3.resource("dynamodb", region_name=args.region).Table(args.table)
    if table.key_schema != [{"AttributeName": "company_id", "KeyType": "HASH"}]:
        parser.error(f"{args.table} does not have the directory key schema.")
    with table.batch_writer(overwrite_by_pkeys=["company_id"]) as writer:
        for company in records:
            writer.put_item(Item=company)
    print(f"Seeded {len(records)} company records into {table.name}.")


if __name__ == "__main__":
    main()
