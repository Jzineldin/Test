"""SES inbound email -> appetitematch /webhooks/email bridge.

Flow:
  1. AWS SES receives mail to triage+<slug>@appetitematch.com
  2. SES rule action writes the raw RFC822 message to S3
  3. S3 ObjectCreated triggers this Lambda
  4. Lambda reads the raw message, parses MIME, base64s attachments,
     HMAC-signs the body with WEBHOOK_SECRET, POSTs to API_URL.

Environment:
  API_URL          https://submission-triage-api.onrender.com/webhooks/email
  WEBHOOK_SECRET   per-org webhook_secret from /me  (Settings -> Webhook secret)
  S3_BUCKET        bucket SES writes raw mail to (e.g. appetitematch-ses-inbound)

IAM the Lambda role needs:
  s3:GetObject on the SES bucket  (CloudFormation/console grants this when
  you set the S3 trigger).
"""
from __future__ import annotations

import base64
import email
import hashlib
import hmac
import json
import os
import urllib.request
from email.message import Message
from urllib.parse import unquote_plus

import boto3

API_URL = os.environ["API_URL"]
WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]

_s3 = boto3.client("s3")


def _decode_header(value: str | None) -> str:
    if not value:
        return ""
    parts = email.header.decode_header(value)
    out: list[str] = []
    for chunk, charset in parts:
        if isinstance(chunk, bytes):
            out.append(chunk.decode(charset or "utf-8", errors="replace"))
        else:
            out.append(chunk)
    return "".join(out)


def _parse_addr(value: str | None) -> str:
    if not value:
        return ""
    _, addr = email.utils.parseaddr(_decode_header(value))
    return addr


def _walk_parts(msg: Message) -> tuple[str, list[dict]]:
    body_text = ""
    attachments: list[dict] = []
    for part in msg.walk():
        if part.is_multipart():
            continue
        disp = (part.get("Content-Disposition") or "").lower()
        ctype = (part.get_content_type() or "").lower()
        payload = part.get_payload(decode=True) or b""
        if "attachment" in disp or part.get_filename():
            filename = _decode_header(part.get_filename()) or "attachment.bin"
            attachments.append({
                "filename": filename,
                "content_type": ctype,
                "content_base64": base64.b64encode(payload).decode("ascii"),
            })
        elif ctype == "text/plain" and not body_text:
            charset = part.get_content_charset() or "utf-8"
            body_text = payload.decode(charset, errors="replace")
    return body_text, attachments


def handler(event: dict, _context) -> dict:
    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = unquote_plus(record["s3"]["object"]["key"])
        raw = _s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        msg = email.message_from_bytes(raw)

        body_text, attachments = _walk_parts(msg)
        payload = {
            "to": _parse_addr(msg.get("To")),
            "from_address": _parse_addr(msg.get("From")),
            "subject": _decode_header(msg.get("Subject")),
            "body": body_text,
            "attachments": attachments,
        }
        body = json.dumps(payload).encode("utf-8")
        sig = hmac.new(
            WEBHOOK_SECRET.encode("utf-8"), body, hashlib.sha256,
        ).hexdigest()

        req = urllib.request.Request(
            API_URL,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Triage-Signature": f"sha256={sig}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            print(f"posted s3://{bucket}/{key} -> {resp.status}")
    return {"ok": True}
