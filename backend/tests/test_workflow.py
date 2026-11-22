"""Exercise API Gateway events against emulated AWS resources with no network calls."""
import base64
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import boto3
from botocore.exceptions import ClientError
from moto import mock_aws

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))


class Workflow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = patch.dict(os.environ, {
            "AWS_DEFAULT_REGION": "us-east-1", "AWS_ACCESS_KEY_ID": "testing",
            "AWS_SECRET_ACCESS_KEY": "testing", "MODEL_ID": "amazon.nova-lite-v1:0",
            "DIRECTORY_TABLE": "Directory", "REQUESTS_TABLE": "Requests", "ALLOW_LIVE": "false",
            "SENDER": "sender@example.org", "DEMO_RECIPIENT": "demo@example.org",
            "ORIGIN": "http://localhost:3000"})
        cls.env.start()
        cls.aws = mock_aws()
        cls.aws.start()
        import handler
        cls.api = staticmethod(handler.handler)
        cls.handler_module = handler
        db = boto3.client("dynamodb")
        def attr(k):
            return {"AttributeName": k, "AttributeType": "S"}
        def key(k, role="HASH"):
            return {"AttributeName": k, "KeyType": role}
        db.create_table(TableName="Directory", KeySchema=[key("company_id")],
                        AttributeDefinitions=[attr("company_id")], BillingMode="PAY_PER_REQUEST")
        db.create_table(TableName="Requests", KeySchema=[key("request_id")],
                        AttributeDefinitions=[attr(k) for k in ("request_id", "owner", "created_at")],
                        GlobalSecondaryIndexes=[{"IndexName": "OwnerCreated",
                            "KeySchema": [key("owner"), key("created_at", "RANGE")],
                            "Projection": {"ProjectionType": "ALL"}}], BillingMode="PAY_PER_REQUEST")
        data = json.loads((ROOT / "seed/seed_directory.json").read_text(encoding="utf-8"))
        for company in data:
            handler.db.directory.put_item(Item=company)
        boto3.client("ses").verify_email_identity(EmailAddress=os.environ["SENDER"])
        denied = ClientError({"Error": {"Code": "AccessDeniedException", "Message": "Offline test"}}, "Converse")
        cls.model = patch.object(handler.ai.client, "converse", side_effect=denied)
        cls.model.start()

    @classmethod
    def tearDownClass(cls):
        cls.model.stop()
        cls.aws.stop()
        cls.env.stop()

    def call(self, key, body=None, owner="citizen", rid=None, expected=200):
        event = {"routeKey": key, "body": json.dumps(body or {}), "pathParameters": {"request_id": rid},
                 "requestContext": {"authorizer": {"jwt": {"claims": {"sub": owner, "token_use": "id",
                 "email_verified": "true", "email": "citizen@example.org"}}}}}
        result = self.api(event, None)
        self.assertEqual(result["statusCode"], expected, result["body"])
        return json.loads(result["body"])

    def test_workflow(self):
        self.assertEqual(len(self.call("GET /api/directory")["items"]), 25)
        self.call("GET /api/requests", owner="", expected=401)
        company = self.handler_module.db.match("", "AD-BAJAJF-P")
        self.assertEqual(company["company_id"], "bajaj-finance")
        draft = self.call("POST /api/analyze", {"name": "Demo Citizen", "identifier": "demo@example.org",
                                                "company_id": company["company_id"]})
        rid = draft["request_id"]
        payload = {"request_id": rid, "notice": draft["notice"] + "\nReviewed by citizen."}
        self.call("POST /api/dispatch", payload, owner="other", expected=404)
        self.call("POST /api/dispatch", {**payload, "safe_mode": False}, expected=403)
        self.call("POST /api/dispatch", {**payload, "demo_recipient": "other@example.org"}, expected=400)
        sent = self.call("POST /api/dispatch", payload)
        self.assertEqual(sent["recipient"], os.environ["DEMO_RECIPIENT"])
        self.assertEqual(sent["notice"], payload["notice"])
        self.assertEqual(self.call("POST /api/dispatch", payload)["ses_message_id"], sent["ses_message_id"])
        self.assertEqual(self.call("GET /api/requests", owner="other")["items"], [])
        self.call("POST /api/escalate", {"request_id": rid}, expected=409)
        self.call("PATCH /api/requests/{request_id}", {"action": "simulate"}, rid=rid)
        dossier = self.call("POST /api/escalate", {"request_id": rid})
        self.assertIn(sent["ses_message_id"], dossier["complaint"])
        self.assertIn("Simulated expiry: True", dossier["complaint"])
        self.call("PATCH /api/requests/{request_id}", {"action": "resolve"}, rid=rid)
        self.assertEqual(self.call("GET /api/requests")["items"][0]["status"], "RESOLVED")

    def test_model_output(self):
        parse = self.handler_module.ai.extract_json
        self.assertEqual(parse('Result: ```json\n{"brand":"Airtel"}\n```'), {"brand": "Airtel"})
        self.assertEqual(parse("unreadable"), {})

    def test_screenshot_matching_and_expiry(self):
        png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl+0v0AAAAASUVORK5CYII="
        def reply(text):
            return {"output": {"message": {"content": [{"text": text}]}}}
        answers = [reply('{"brand":"Airtel","header":"AD-AIRTEL-P","excerpt":"Plan upgrade"}'),
                   reply('{"sentence":"Please withdraw my marketing consent."}')]
        owner = "screenshot-citizen"
        with patch.object(self.handler_module.ai.client, "converse", side_effect=answers) as converse:
            draft = self.call("POST /api/analyze", {"name": "Citizen", "identifier": "sample@example.org",
                              "image": png}, owner=owner)
            image = converse.call_args_list[0].kwargs["messages"][0]["content"][0]["image"]
            self.assertEqual(image["source"]["bytes"], base64.b64decode(png))
        self.assertEqual(draft["company"]["brand"], "Airtel")
        self.assertEqual(draft["evidence"], "Plan upgrade")
        rid = draft["request_id"]
        payload = {"request_id": rid, "notice": draft["notice"]}
        denied = ClientError({"Error": {"Code": "MessageRejected"},
                              "ResponseMetadata": {"HTTPStatusCode": 400}}, "SendRawEmail")
        with patch.object(self.handler_module.mail, "send", side_effect=denied):
            self.call("POST /api/dispatch", payload, owner=owner, expected=422)
        self.assertEqual(self.handler_module.db.get(owner, rid)["status"], "DRAFT")
        self.call("POST /api/dispatch", payload, owner=owner)
        sent = self.handler_module.db.get(owner, rid)
        self.handler_module.db.update(sent, "SENT", compliance_deadline="2000-01-01T00:00:00+00:00")
        self.assertEqual(self.call("GET /api/requests", owner=owner)["items"][0]["status"], "BREACHED")
        dossier = self.call("POST /api/escalate", {"request_id": rid}, owner=owner)
        self.assertIn("Simulated expiry: False", dossier["complaint"])

    def test_malformed_inputs(self):
        self.call("POST /api/analyze", {"name": "Citizen", "identifier": "demo", "image": "!!!"}, expected=400)
        self.call("POST /api/analyze", {"name": "Citizen", "identifier": "demo"}, expected=422)


if __name__ == "__main__":
    unittest.main()
