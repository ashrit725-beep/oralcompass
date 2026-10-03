# infra — what is real and what is not

`template.yaml` is a reviewed-but-undeployed SAM skeleton for the production shape described in `docs/CODELINC_DENTAL_PRODUCT_SPEC.md` §5:
Cognito (optional TOTP MFA) → HTTP API with JWT authorizer → Lambda (FastAPI via Mangum) → S3 (SSE-KMS, versioned, 1-day lifecycle on `users/`,
deny-unencrypted and deny-insecure-transport policies) → DynamoDB (CMK) → KMS (rotation on). Bedrock invoke permission for the extraction model
(use a model in zero-data-retention mode and name it on the Privacy Panel).

Honest status for the packet:
- Implemented in code and tested locally: owner-scoped reads with constant 404, ids-only audit log, read-only presets, redaction, runtime advice guard.
- Demonstrated with synthetic data: cross-account denial, deletion counts, redaction preview, injected-instruction fixture, lint blocking a sentence.
- Not completed for production: deployment of this template, WAF/rate limiting, penetration test, SOC 2 / HIPAA assessment (a BAA with AWS is required for PHI — none is in place), key-rotation policy review, retention policy review, accessibility audit, legal review of disclosures.

Deploy (when ready): `sam build && sam deploy --guided --parameter-overrides BedrockModelId=<model id>`; add `api/app/lambda_handler.py` with `handler = Mangum(app)`.
