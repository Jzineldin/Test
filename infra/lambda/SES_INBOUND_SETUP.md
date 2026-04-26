# SES Inbound -> /webhooks/email setup

End state: a broker forwards an ACORD-attached email to
`triage+<slug>@appetitematch.com`, AWS SES drops the raw message in S3,
S3 fires a Lambda that parses MIME and POSTs to our API.

Pre-reqs (already done):
- DKIM Successful + DMARC published on `appetitematch.com`
- MX record `@ inbound-smtp.us-east-1.amazonaws.com priority 10` (Cloudflare DNS-only)
- SES region: `us-east-1`

## 1. Create the S3 bucket (1 min)

AWS Console -> S3 -> Create bucket
- Name: `appetitematch-ses-inbound`
- Region: `us-east-1`
- Block all public access: ON
- Everything else default -> Create

Then add the bucket policy that lets SES write to it:

S3 -> bucket -> Permissions -> Bucket policy -> Edit:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowSESPuts",
    "Effect": "Allow",
    "Principal": {"Service": "ses.amazonaws.com"},
    "Action": "s3:PutObject",
    "Resource": "arn:aws:s3:::appetitematch-ses-inbound/*",
    "Condition": {
      "StringEquals": {"AWS:SourceAccount": "<YOUR_AWS_ACCOUNT_ID>"}
    }
  }]
}
```

Replace `<YOUR_AWS_ACCOUNT_ID>` with the 12-digit number in the
top-right of the console (click your username).

## 2. Create the Lambda (3 min)

AWS Console -> Lambda -> Create function
- Function name: `appetitematch-ses-inbound`
- Runtime: Python 3.11
- Architecture: x86_64
- Permissions: Create a new role with basic Lambda permissions
- Create function

Once created:
- **Code tab** -> paste the contents of `ses_inbound.py` (this directory)
  into `lambda_function.py`, replace the file -> Deploy
- **Configuration -> General configuration** -> Edit -> Timeout: 30 sec, Memory: 512 MB
- **Configuration -> Environment variables** -> Edit -> Add:
  - `API_URL` = `https://submission-triage-api.onrender.com/webhooks/email`
  - `WEBHOOK_SECRET` = (paste from app Settings -> Webhook secret;
     in the API: `GET /me` returns `webhook_secret`)
- **Configuration -> Permissions** -> click the role name -> Add permissions ->
  Create inline policy -> JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::appetitematch-ses-inbound/*"
  }]
}
```

Save as `ses-inbound-s3-read`.

## 3. Wire S3 -> Lambda trigger (1 min)

Lambda function page -> **Add trigger** -> S3
- Bucket: `appetitematch-ses-inbound`
- Event types: All object create events
- Acknowledge the recursive-invocation warning -> Add

## 4. Create the SES receipt rule (2 min)

SES -> Email receiving -> Receipt rule sets -> Create rule set
- Name: `appetitematch-default` -> Create
- Set as active rule set (button on the rule sets list)

Open the rule set -> Create rule:
- Rule name: `triage-inbound`
- Recipient conditions: add `appetitematch.com` (catches all addresses on the domain;
  the `triage+slug@` filtering happens server-side via `forward_inbox_address`)
- Actions: **Deliver to S3 bucket**
  - Bucket: `appetitematch-ses-inbound`
  - Object key prefix: `incoming/`
- Save -> Set as active rule

## 5. Smoke test (2 min)

From any external mailbox, send an email with a small PDF attached to:

`triage+demo@appetitematch.com`

Within 30 sec:
- S3 bucket has a new object under `incoming/`
- Lambda **Monitor -> Logs** has a `posted s3://...-> 200` line
- App `/app` shows a new triage run

If you see anything other than 200, paste me the CloudWatch log line.

## Common gotchas

- **MX record proxied (orange cloud) on Cloudflare** -> mail bounces. Must be DNS-only.
- **Lambda timeout** -> raise to 30s; Document AI parse can take 5-15s.
- **WEBHOOK_SECRET mismatch** -> API returns 401. Re-copy from `/me`.
- **Wrong region** -> SES Inbound only works in us-east-1, us-west-2, eu-west-1.
- **Bucket policy missing SourceAccount** -> SES refuses to write
  (newer accounts require it as anti-confused-deputy).
