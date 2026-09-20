# Provider activation checklist

What is still needed from outside this machine, and nothing else. Every item
below is genuinely external: the code, the local verification and the
configuration contract are finished and named. Anything that was only missing
code is not in this list — it was built in this loop.

No credential, key or password appears here or should ever be pasted into a
chat: put values in the environment files named for each item.

For each item: what to create, the exact setting names, and the command or check
that proves it works afterwards.

## Order

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8, then the Render decommission (9). Steps 1 and 2
are independent of everything else and can be done now.

---

## 1. Revoke the exposed Render API key (P0, do this first)

The GitHub token that was in public git history is already invalid (verified:
`401 Bad credentials`). The Render API key from the same file **is still live**.

- Render Dashboard → Account Settings → **API Keys** → revoke the key beginning `rnd_Dsvl`.
- Do **not** create a replacement: the target architecture no longer uses Render.
- Verify (prints only a status code; expects `401`):
  ```bash
  RN=$(grep -oE 'rnd_[A-Za-z0-9_]{28}' /Users/macbook/Projects/umrah-connects/.claude/settings.local.json | head -1); curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $RN" https://api.render.com/v1/owners; unset RN
  ```
- Then delete the dead allow-list entries from the four local `.claude/settings.local.json` files.

Detail: `CREDENTIAL_REMEDIATION.md`. Register rows: `W40.L`, and `S23` depends on it.

## 2. `www.umrahconnect.io` certificate (AUD-020 / I07)

`www` currently fails TLS (checked this loop); the apex is fine.

- Vercel → Project → Domains → add `www.umrahconnect.io`, redirecting to the apex.
- Verify: `curl -I https://www.umrahconnect.io` → `308` with a valid certificate.

## 3. Hostinger KVM 8 host (BLK-01 / I06)

No Umrah server is identified anywhere in this repository, and nothing was
deployed in this loop.

- Provide: the KVM 8 host, SSH access for a `deploy` user, and a DNS `A` record
  `api.umrahconnect.io` → that host.
- Settings: `infrastructure/kvm/.env.production` (names in `.env.production.example`),
  including the new `APP_DB_USER` / `APP_DB_PASSWORD` (the API must run as the
  non-superuser runtime role — see `RLS.md`) and the owner credentials used only
  by the one-off `uc-migrate` service.
- Verify: `scripts/preflight.sh` passes, then after the first deploy
  `curl https://api.umrahconnect.io/api/v1/health/ready` → `{"status":"ready","rowLevelSecurity":"enforced"}`.
  A `503 DATABASE_ROLE_UNSAFE` means the API is still connecting as an owner or
  bypass role — fix the role, do not disable the check.

## 4. Cloudflare R2 (BLK-02 / O03, and the off-site half of D06)

Verified locally against MinIO, which is a stand-in, not R2.

- Create: a **private documents** bucket, a **public media** bucket with a custom
  domain, an API token scoped to both, and a separate **backups** bucket (create
  it in the dashboard — `rclone mkdir` silently succeeds without creating it when
  `no_check_bucket = true`), plus lifecycle rules.
- Settings: `STORAGE_DRIVER=r2`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_PUBLIC_BUCKET`,
  `S3_PUBLIC_BASE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; for backups an
  `rclone` remote and `OFFSITE_REMOTE`.
- Verify: `platform/api/test/providers/storage-s3.int-spec.ts` pointed at R2 (upload →
  signed download → refusal of a tampered signature), and `infrastructure/kvm/scripts/check-offsite.sh`
  (write → read back → delete round trip).

## 5. SMTP (BLK-03 / A13)

Mail is verified through the log driver and Mailpit only.

- Create: a mailbox, plus SPF, DKIM and DMARC records on `umrahconnect.io`.
- Settings: `MAIL_DRIVER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
  `SMTP_PASS`, `MAIL_FROM`.
- Verify: forgot-password and email verification round trips to a real inbox; a
  traveler link invitation arrives. Without SMTP, production returns `503` instead
  of pretending to send — that is deliberate.

## 6. Google Sign-In (BLK-05 / A11)

The whole flow is implemented and verified end to end against a local stub OIDC
provider, and labelled as stubbed in the UI. It has never met Google.

- Create: a Google Cloud **Web** OAuth client and consent screen.
- Settings: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
  `GOOGLE_REDIRECT_URI` = **the web origin plus `/proxy-api/auth/google/callback`**
  (production: `https://umrahconnect.io/proxy-api/auth/google/callback`) — the state
  cookie is set on the web origin, so any other value breaks the flow. `http://localhost…`
  is accepted outside production; https is required in production.
- Never set `GOOGLE_OIDC_STUB_URL` in production (the API refuses to start with it).
- Verify: `GET /auth/google/status` reports `enabled: true, mode: "google"`, then sign
  in with a real Google account; check that linking from settings returns to
  `/settings?linked=google`.

## 7. Stripe test mode (BLK-04 / T04)

Implemented against the official SDK and verified against `stripe-mock` and the
development sandbox — neither is Stripe.

- Create: a Stripe account; **test** keys first; a webhook endpoint to
  `https://api.umrahconnect.io/api/v1/payments/webhook/stripe`.
- Settings: `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET`.
- Verify in test mode only, with Stripe's own test cards: a successful payment
  (`4242 4242 4242 4242`), a decline (`4000 0000 0000 0002`), an authentication-required
  card (`4000 0025 0000 3155`), an interrupted checkout resumed, a duplicate submit, and
  a webhook delivery showing the payment captured. The booking or invoice must only
  read "paid" after the server says so.

## 8. Live activation and monitoring

- **Stripe live** (`N-PRV-1`): activate the account, swap in live keys and a live
  webhook secret, and re-run one small real payment and refund.
- **Monitoring** (`I08.L`): set the repository variable `UPTIME_MONITOR=on`, set
  `ALERT_WEBHOOK_URL` on the host, enable the three systemd timers, and create the
  external monitor described in the KVM runbook §6.
- **Off-site backups** (`D06.L`): confirm the nightly copy in the timer log and run one
  restore drill from the off-site copy.
- **Hero asset** (`N-BRD-1`): supply the approved Makkah/Kaaba image at
  `apps/web/public/images/hero/makkah-approved.webp` (see `docs/ui-ux/HERO_ASSET.md`);
  the landing page renders the slot only when the file exists.

## 9. Decommission Render (`N-OPS-5`)

Only after the KVM API is live and verified, and a backup of the Render database
exists: suspend the service, watch for 24–72 hours, then delete it and revoke
Render's GitHub app access. Full order in `RENDER_RETIREMENT.md`.

---

## Not on this list, on purpose

- Anything that was only missing code, a screen, a field or a test — all of that was
  built and verified in this loop.
- A test-tool limitation is not a provider blocker: the screen-reader and
  provider-stand-in limits are recorded as such in `ENGINEERING_100_SCORECARD.md`.
- Deployment itself is outside this loop's authorization; the steps are listed so the
  owner can authorize a separate deployment loop.
