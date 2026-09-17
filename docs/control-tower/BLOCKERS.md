# Blockers

Only real external blockers are listed. Engineering that did not depend on them
is finished and verified. Updated for the web integration closure loop.

| ID | Blocks | Owner | What is needed | Exact configuration (names only) | Verification once unblocked |
|---|---|---|---|---|---|
| BLK-09 | **Credential exposure — act first** | Repository owner | Revoke the GitHub personal access token and the Render API key that are present in pushed git history in `.claude/settings.local.json` (commit `5074b81`, reachable from `origin/main` and `origin/develop`). The file is now untracked and ignored, which stops it getting worse but does not un-publish the tokens. After revoking, decide whether to rewrite history or accept the revoked values remaining. | — | provider shows both tokens revoked; `git log --all -- .claude/settings.local.json` reviewed |
| BLK-01 | Production API (AUD-001), launch | Platform owner | Hostinger KVM 8 access (SSH key), DNS A record `api.umrahconnect.io`, authorization for a deployment loop | `infrastructure/kvm/.env.production` (names in `.env.production.example`) | `curl https://api.umrahconnect.io/api/v1/health/ready`; runtime QA against staging |
| BLK-02 | Durable document/media storage (AUD-011, O03) | Platform owner | Cloudflare R2: private documents bucket, public media bucket with a custom domain, API token scoped to both | `STORAGE_DRIVER`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_PUBLIC_BUCKET`, `S3_PUBLIC_BASE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `storage-s3.int-spec.ts` pointed at R2; upload + signed download in staging. The web side already admits the media host via `S3_PUBLIC_MEDIA_HOST`/`S3_PUBLIC_BASE_URL`. |
| BLK-03 | Password reset & verification email (AUD-010, A13) | Platform owner | SMTP mailbox; SPF/DKIM/DMARC on `umrahconnect.io` | `MAIL_DRIVER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | forgot-password round trip to a real inbox |
| BLK-04 | Card payments (AUD-022, T04) | Platform owner | Stripe account; test keys first, live keys at launch; webhook endpoint | `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | test-mode checkout with `4242 4242 4242 4242`; webhook delivery shows `captured`. Note the traveler-facing Stripe UI (XT-R09) is still to be built. |
| BLK-05 | Google Sign-In verification (A11) | Platform owner | Google Cloud OAuth client (Web) with redirect URIs | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | sign-in with a real Google account in staging. Note the sign-in button and callback page (XT-R06) are still to be built. |
| BLK-06 | Off-site backups (D06) | Platform owner | A separate R2 bucket and an `rclone` remote on the server | `OFFSITE_REMOTE` | nightly timer log shows the copy; restore drill from the remote copy |
| BLK-07 | `www.umrahconnect.io` certificate (AUD-020) | Platform owner | Add `www` in Vercel domains (redirect to apex) | — | `curl -I https://www.umrahconnect.io` → 308 |
| BLK-08 | Traveler visa status (XT-003) | Product | Decide how a traveler account links to organization pilgrim records (consent, matching) | — | design + endpoint in a later loop |

## Resolved this loop

| Was | Now |
|---|---|
| XT-R05 — no proxy secret or client-IP forwarding, so every user shared one rate-limit bucket | Resolved. `apps/web/middleware.ts`; independent buckets verified. |
| XT-R01 — refresh token in `localStorage` | Resolved. httpOnly cookie only; `AUTH_REFRESH_TOKEN_IN_BODY=false`. |
| XT-R03 — private documents unopenable from the UI | Resolved. Signed-URL flow for visa and KYC documents. |
| Production fallback to a dead `onrender.com` origin | Resolved. Missing `API_PROXY_ORIGIN` now fails the production build. |

Not blockers: native mobile (out of scope); the five unbuilt frontend surfaces
(XT-R06, R07, R08, R09, R13) — those are engineering work with finished server
contracts, tracked in INTEGRATION_EXECUTION_MATRIX.md, not blocked on anyone.
