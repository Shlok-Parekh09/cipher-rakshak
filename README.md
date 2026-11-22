# CipherRakshak

CipherRakshak helps a citizen identify the sender of a promotion, review a consent-withdrawal and erasure request, send it by email, track a response, and prepare a complaint dossier. The frontend is a static Next.js 14 App Router export. Screenshots are resized in the browser before the authenticated API passes them to Bedrock Converse. DynamoDB stores the reviewed notice, a short transcription and a SHA-256 digest. The citizen retains the original image.

## Repository

```text
amplify.yml
README.md
backend/
  template.yaml
  requirements.txt
  seed/
    seed_directory.json
    seed_dynamodb.py
  src/
    requirements.txt
    handler.py
    prompts.py
    bedrock_service.py
    db_service.py
    ses_service.py
  tests/
    test_workflow.py
frontend/
  next.config.mjs
  next-env.d.ts
  package.json
  package-lock.json
  postcss.config.js
  tailwind.config.ts
  tsconfig.json
  src/
    app/
      globals.css
      layout.tsx
      page.tsx
    components/
      Navbar.tsx
      InputPanel.tsx
      NoticeWorkspace.tsx
      ComplianceTracker.tsx
      EscalationModal.tsx
    lib/
      api.ts
      sampleSpam.ts
    types/
      cipher_rakshak.ts
```

## Legal meaning of the tracker

As of 21 November 2026, G.S.R. 843(E) schedules sections 6(4), 12, 13, the relevant Board complaint powers and section 33 to commence eighteen months after Gazette publication, in May 2027. Citizens can still send an ordinary withdrawal or deletion request. The interface labels seven days as the sender's requested follow-up period. Once operative, rule 14 requires publication of a grievance response period of up to 90 days. Check the applicable policy, commencement and actual correspondence before filing. [Commencement notification](https://upload.indiacode.nic.in/showfile?actid=AC_CEN_45_0_00003_2023-22_1763464807080&filename=c56ceae6c383460ca69577428d36828b.pdf&type=hindinotification) · [Final Rules](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025-2)

Section 13(3) requires exhaustion of the fiduciary's grievance process. Section 27(1)(b) concerns a complaint about a breach of obligations. Section 27(1)(a) addresses a personal data breach intimation. Section 33 makes a monetary penalty subject to the Board's findings. Erasure is subject to the retention exceptions in section 12(3). Dossier generation prepares a document for signature and independent filing. [DPDP Act](https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf)

## Deploy the backend

Run from the repository root in PowerShell with AWS CLI v2, AWS SAM CLI, Docker, Python and Node.js 22. Use an authenticated AWS profile with CloudFormation, IAM and service provisioning permissions. Commands below create billable AWS resources. Cost depends on account credits, traffic, retention and region. The example uses in-region Amazon Nova Lite in us-east-1. Select a region and model appropriate for your data handling requirements before sending real evidence. [Nova Lite availability](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html)

```powershell
$env:AWS_DEFAULT_REGION = "us-east-1"
$senderAddress = Read-Host "SES sender email you control"
$demoAddress = Read-Host "Verified demo recipient email you control"
aws sts get-caller-identity
aws ses verify-email-identity --email-address $senderAddress
aws ses verify-email-identity --email-address $demoAddress
```

Open the verification links in both inboxes, then check that both identities report Success. SES identities and sandbox access are regional. Live dispatch requires production SES access or verification of every recipient including the citizen CC. The server checks its own configured demo inbox and ignores client attempts to choose a different delivery destination. [SES sending guide](https://docs.aws.amazon.com/us_en/ses/latest/dg/getting-started-sending.html)

```powershell
aws ses get-identity-verification-attributes --identities $senderAddress $demoAddress
sam validate --lint --template-file backend/template.yaml
sam build --use-container --template-file backend/template.yaml
sam deploy --stack-name cipher-rakshak --resolve-s3 --capabilities CAPABILITY_IAM --parameter-overrides "Sender=$senderAddress" "DemoRecipient=$demoAddress" "Origin=http://localhost:3000" "AllowLive=false"
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend/requirements.txt
.\.venv\Scripts\python backend/seed/seed_dynamodb.py --check
.\.venv\Scripts\python backend/seed/seed_dynamodb.py --region $env:AWS_DEFAULT_REGION
$outputs = (aws cloudformation describe-stacks --stack-name cipher-rakshak | ConvertFrom-Json).Stacks[0].Outputs
$env:NEXT_PUBLIC_API_URL = ($outputs | Where-Object OutputKey -eq Endpoint).OutputValue
$env:NEXT_PUBLIC_CLIENT_ID = ($outputs | Where-Object OutputKey -eq ClientId).OutputValue
$env:NEXT_PUBLIC_AWS_REGION = $env:AWS_DEFAULT_REGION
$env:NEXT_PUBLIC_DEMO_RECIPIENT = $demoAddress
Invoke-RestMethod "$env:NEXT_PUBLIC_API_URL/api/health"
(Invoke-RestMethod "$env:NEXT_PUBLIC_API_URL/api/directory").items.Count
```

Expect 25 directory entries. Each entry identifies a source and dispatch eligibility. Historical DLT codes and a fuzzy brand match are clues for the citizen to check against their evidence. For an ambiguous screenshot, choose the company explicitly and retry. Public contact details and legal entities can change. Review the linked policy before a live send.

## Build and run locally

```powershell
Push-Location frontend
npm ci
npm run build
npm run dev
```

Open http://localhost:3000 and select **Safe mode** in the header. Create an account, confirm the code sent by Cognito, then sign in. The browser keeps the identity token in memory until refresh or sign-out. Sign in again after token expiry. Only public endpoint and demo settings persist locally. API Gateway validates the token issuer and audience. The Lambda checks the verified email claim and uses the subject as the owner. Finish the dev server with Ctrl+C and run `Pop-Location`.

## Deploy the static export on Amplify Hosting

The following PowerShell commands create a manual-deploy Amplify app and upload the built static files. Run from the repository root in the same configured shell. The ZIP contains the contents of the output directory at its root.

```powershell
$app = (aws amplify create-app --name CipherRakshak --platform WEB | ConvertFrom-Json).app
aws amplify create-branch --app-id $app.appId --branch-name main --stage PRODUCTION
$origin = "https://main.$($app.defaultDomain)"
sam deploy --stack-name cipher-rakshak --resolve-s3 --capabilities CAPABILITY_IAM --parameter-overrides "Sender=$senderAddress" "DemoRecipient=$demoAddress" "Origin=$origin" "AllowLive=false"
Push-Location frontend
npm ci
npm run build
Pop-Location
$zipPath = Join-Path ([IO.Path]::GetTempPath()) ("cipher-rakshak-" + [guid]::NewGuid() + ".zip")
Compress-Archive -Path frontend/out/* -DestinationPath $zipPath
$deployment = aws amplify create-deployment --app-id $app.appId --branch-name main | ConvertFrom-Json
Invoke-WebRequest -Method Put -InFile $zipPath -Uri $deployment.zipUploadUrl -ContentType application/zip
aws amplify start-deployment --app-id $app.appId --branch-name main --job-id $deployment.jobId
aws amplify get-job --app-id $app.appId --branch-name main --job-id $deployment.jobId --query job.summary.status
Write-Output $origin
```

For continuous deployments connect the repository in Amplify Hosting, select the frontend app root and supply the four `NEXT_PUBLIC_*` values above as build environment variables. Set `AMPLIFY_MONOREPO_APP_ROOT=frontend`. The root build specification exports the `out` directory. Redeploy the backend with the actual branch origin when changing hosts. [Amplify monorepo configuration](https://docs.aws.amazon.com/amplify/latest/userguide/monorepo-configuration.html)

## Request lifecycle and operations

| Route | Behavior |
| --- | --- |
| GET /api/health | Public liveness and deployment dispatch mode |
| GET /api/directory?q= | Public directory search |
| POST /api/analyze | Verified citizen, company selection or base64 JPEG/PNG, optional explicit sender confirmation, saved draft |
| POST /api/dispatch | Validates draft ownership, locks draft, sends MIME email, persists SES acceptance ID |
| GET /api/requests | Owner-scoped reverse chronology and cursor pagination |
| PATCH /api/requests/{request_id} | Mark resolved or simulate expiry on a sent demo record |
| POST /api/escalate | Generate and persist a complaint draft after follow-up expiry |

Raw images stay out of DynamoDB and application logs. Records have a one-year DynamoDB TTL. AWS deletes expired items asynchronously. The requests table is retained when the stack is deleted. Remove retained citizen data separately according to your retention policy.

A retry on a completed dispatch returns the existing receipt. An explicit SES rejection releases the lock for correction. A network interruption or crash after sending leaves the record in DISPATCHING. An operator must reconcile the notice ID against the mail trail before changing that record. Reconcile confirmed acceptance using the real SES message ID and timestamp. Release the lock only after establishing the original send failed. SES acceptance does not establish delivery to the company. [SES mail lifecycle](https://docs.aws.amazon.com/ses/latest/dg/send-email-concepts-process.html)

## Verification

```powershell
.\.venv\Scripts\python -m pip install "moto[dynamodb,ses]"
.\.venv\Scripts\python -m unittest discover -s backend/tests -v
Push-Location frontend
npm run typecheck
npm run build
Pop-Location
```

The workflow tests use emulated DynamoDB and SES, with Bedrock failure injected to exercise the legal fallback. Before a presentation, send a sample to your verified demo inbox and inspect the received MIME message. Confirm the real SES acceptance ID in the tracker. Exercise image-only matching with a legible sample and no selected company to check regional model access.

## Fifteen-second stage sequence

Before the timed segment, verify both SES identities, sign in, enter fictional citizen details, load the directory and warm the API with one rehearsal. Use the generated Bajaj Finance sample and confirm the displayed recipient. Keep a previously sent demo record available in the tracker if live inference or email is slow. The clock reports measured time, which varies with AWS latency.

| Target time | Presenter action |
| --- | --- |
| 0–4 s | Load the sample and select **Analyze & draft notice**. |
| 4–8 s | Show the matched legal entity, published contact and editable withdrawal text. |
| 8–11 s | Select **Send to demo inbox** and show the SES acceptance ID. |
| 11–15 s | Select **Simulate expiry**, then **Open dossier** and show the verification block. |

## Ninety-second pitch

**0–20 seconds.** “An unwanted loan offer lands on my phone. The sender is an SMS header, and finding the right grievance contact takes longer than deleting the message. With CipherRakshak, I can start from that screenshot or search for the company by name.”

**20–45 seconds.** “Watch the sender match. The browser resizes my screenshot, Bedrock reads it, and CipherRakshak checks the result against a sourced company directory. I can inspect the published contact and change every word of my request before sending. The notice asks the company to stop marketing and erase information it no longer needs.”

**45–65 seconds.** “I’m sending to our verified demo inbox. Here is the actual SES acceptance ID. My account keeps the reviewed text, timestamp and follow-up date together. If the company responds, I can mark the matter resolved.”

**65–90 seconds.** “I’ll advance this demo record to its follow-up date. CipherRakshak prepares the chronology, proposed relief and signature block in a printable dossier. The citizen checks the facts and applicable grievance process before filing. That leaves them with something practical after a spam message: a named recipient, a reviewed request and a record they can follow.”
