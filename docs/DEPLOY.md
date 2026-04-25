# Deploy guide

End-to-end production deploy: API on AWS Lambda + RDS Postgres, dashboard on
Vercel. Should take under an hour the first time.

## Prereqs

| Tool | Why |
|------|-----|
| AWS CLI v2 (configured) | Lambda + RDS + SES |
| AWS SAM CLI | Build + deploy the API |
| Vercel CLI | Deploy the dashboard |
| Node 20+, Python 3.11+ | Local builds |

## 1. Postgres (RDS or Neon)

Cheapest path for v0: Neon free tier — give it 5 minutes.
1. https://neon.tech → new project → copy the connection string
2. Convert it to SQLAlchemy form: replace `postgresql://` with `postgresql+psycopg://`
3. Save as `DATABASE_URL`. You'll paste it into SAM in step 4.

If you want RDS instead: t4g.micro Postgres in a public VPC subnet, db parameter
group with `rds.force_ssl=1`, security group allowing `0.0.0.0/0` on 5432
(tighten later).

## 2. SES (sender verification)

```bash
aws ses verify-email-identity --email-address you@yourdomain.com
# OR for a whole domain (recommended):
aws ses verify-domain-identity --domain yourdomain.com
# Print the DKIM CNAMEs to add at your registrar:
aws ses get-identity-dkim-attributes --identities yourdomain.com
```

New AWS accounts are sandboxed — you can only send to verified addresses
until you request production access. Do that in the SES console once
the demo is working.

## 3. GCP Document AI (real ACORD ingestion)

```bash
gcloud auth application-default login
gcloud services enable documentai.googleapis.com --project=YOUR_PROJECT
# Create a Form Parser processor:
gcloud documentai processors create \
  --location=us \
  --type=FORM_PARSER_PROCESSOR \
  --display-name=acord-form-parser \
  --project=YOUR_PROJECT
```

Note the returned processor id (the part after `processors/`).

For ACORD-specific accuracy, swap to a **Custom Extractor** trained on
30–50 labeled ACORDs — same env vars, just a different processor id.

## 4. Stripe

1. https://dashboard.stripe.com → API keys → copy **Secret key**
2. Products → create one (e.g. "Submission Triage Production") → add a
   recurring **Price** ($2,500/mo). Copy the price id (`price_...`)
3. Webhooks → Add endpoint → URL is the Lambda function URL + `/webhooks/stripe`
   → events: `checkout.session.completed`, `customer.subscription.deleted`
   → copy the **signing secret**

You'll paste the secret + signing secret into SAM in the next step.

## 5. Deploy the API to Lambda

```bash
cd infra/lambda
sam build
sam deploy --guided
# Provide:
#   Stack name           : submission-triage
#   Region               : us-east-1
#   StageName            : prod
#   CorsOrigins          : https://your-dashboard.vercel.app
#   BedrockModelId       : us.anthropic.claude-sonnet-4-6
#   GcpProjectId         : your-gcp-project
#   DocaiProcessorId     : <from step 3>
#   SesFromAddress       : noreply@yourdomain.com
#   StripeSecretKey      : sk_live_...
#   StripeWebhookSecret  : whsec_...
#   DatabaseUrl          : postgresql+psycopg://...
```

Save the printed **ApiUrl** — that's your API base.

Subsequent deploys: just `sam deploy` (parameters cached in samconfig.toml).

## 6. Deploy the dashboard to Vercel

```bash
cd web
vercel link            # first time only
vercel env add NEXT_PUBLIC_API_URL production
# Paste the ApiUrl from step 5
vercel --prod
```

The dashboard now hits your real API.

## 7. Smoke test

```bash
# Health
curl https://YOUR_API/healthz

# Auth check (use the demo key the seed creates on first boot)
curl https://YOUR_API/me -H "Authorization: Bearer demo-key-change-in-prod"

# Triage with the sample submission
curl https://YOUR_API/triage \
  -H "Authorization: Bearer demo-key-change-in-prod" \
  -H "Content-Type: application/json" \
  --data @../data/submissions/acme_plumbing.json | jq .
```

## 8. Rotate the demo key

The bootstrap key (`demo-key-change-in-prod`) is meant for first-touch only.
Generate a new one and update the Org row:

```bash
python -c 'from app.db.orgs import generate_api_key; print(generate_api_key())'
# Paste the result and update the row directly in psql:
#   UPDATE orgs SET api_key = '<new key>' WHERE slug = 'demo';
```

## 9. Custom domain

- Dashboard: Vercel → Project → Domains → add `app.yourdomain.com`
- API: Lambda URLs aren't pretty. Either keep them, or front the function
  with API Gateway + a custom domain (CNAME `api.yourdomain.com`).

## Cost expectations

| Item | Estimate |
|------|----------|
| Lambda (per submission, ~100k req/mo) | ~$5/mo |
| Bedrock Sonnet 4.6 (~$0.04/submission) | $40/1k submissions |
| RDS t4g.micro Postgres | ~$15/mo (or free on Neon) |
| SES | $0.10 per 1k sent |
| Vercel Hobby | $0 |

Burn rate at 1,000 submissions/month is ~$60/mo. Your $15k AWS credits absorb
years of operation at that scale.
