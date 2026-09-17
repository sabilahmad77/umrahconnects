# Blockers

Only real external blockers are listed. Engineering work that did not depend on them is finished and verified.

| ID | Blocks | Owner | What is needed | Exact configuration (names only) | Verification once unblocked |
|---|---|---|---|---|---|
| BLK-01 | Production API (AUD-001), launch | Platform owner | Hostinger KVM 8 access (SSH key), DNS A record `api.umrahconnect.io`, authorization for a deployment loop | `infrastructure/kvm/.env.production` (all names in `.env.production.example`) | `curl https://api.umrahconnect.io/api/v1/health/ready`; runtime QA against staging |
| BLK-02 | Durable document/media storage (AUD-011, O03) | Platform owner | Cloudflare R2: a private documents bucket, a public media bucket with a custom domain, an API token scoped to both | `STORAGE_DRIVER=r2`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_PUBLIC_BUCKET`, `S3_PUBLIC_BASE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `storage-s3.int-spec.ts` pointed at R2; upload + signed download in staging |
| BLK-03 | Password reset & verification email in production (AUD-010, A13) | Platform owner | SMTP mailbox (e.g. Hostinger mail); SPF/DKIM/DMARC on `umrahconnect.io` | `MAIL_DRIVER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | forgot-password round trip to a real inbox |
| BLK-04 | Card payments (AUD-022, T04) | Platform owner | Stripe account; test keys first, live keys at launch; webhook endpoint | `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | test-mode checkout with `4242 4242 4242 4242`; webhook delivery shows `captured` |
| BLK-05 | Google Sign-In verification (A11) | Platform owner | Google Cloud OAuth client (Web) with redirect URIs | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | sign-in with a real Google account in staging |
| BLK-06 | Off-site backups (D06) | Platform owner | A separate R2 bucket and an `rclone` remote on the server | `OFFSITE_REMOTE` | nightly timer log shows the copy; restore drill from the remote copy |
| BLK-07 | `www.umrahconnect.io` certificate (AUD-020) | Platform owner | Add `www` in Vercel domains (redirect to apex) | — | `curl -I https://www.umrahconnect.io` → 308 |
| BLK-08 | Traveler visa status (XT-003) | Product | Decide how a traveler account links to organization pilgrim records (consent, matching) | — | design + endpoint in a later loop |

Not blockers: native mobile (out of scope), frontend items (Codex track, CROSS_TRACK_REQUESTS.md).
