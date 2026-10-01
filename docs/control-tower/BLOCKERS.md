# Blockers

Only real external blockers are listed. Engineering that did not depend on them
is finished and verified. Updated for the web integration closure loop.

> **Updated by the Engineering 100 loop (2026-10-01).** Everything that was only
> missing code, a screen, a field or a test is done. What remains is external, and
> the ordered steps with their verification commands are in
> `PROVIDER_ACTIVATION_CHECKLIST.md`.

| ID | Blocks | Owner | What is needed | Register row |
|---|---|---|---|---|
| BLK-09 | **Credential exposure — act first** | Repository owner | Revoke the Render API key exposed in pushed history (still active, 200 on 2026-10-01). The GitHub token from the same file is already invalid (401). | W40.L (and S23) |
| BLK-01 | Production API, launch | Platform owner | Hostinger KVM 8 host + SSH, DNS `api.umrahconnect.io`, authorization for a deployment loop | I06, N-DEP-1 |
| BLK-02 | Durable document/media storage | Platform owner | Cloudflare R2 buckets + scoped token (verified locally against MinIO only) | O03 |
| BLK-03 | Verification and reset email | Platform owner | SMTP mailbox + SPF/DKIM/DMARC (verified locally through the log driver and Mailpit only) | A13 |
| BLK-04 | Card payments | Platform owner | Stripe test keys and webhook endpoint, then live activation (verified locally against stripe-mock and the sandbox only) | T04, N-PRV-1 |
| BLK-05 | Google Sign-In | Platform owner | Google OAuth Web client; redirect URI = web origin + `/proxy-api/auth/google/callback` (verified locally against a stub only) | A11 |
| BLK-06 | Off-site backups | Platform owner | Off-site R2 bucket + rclone remote (the contract, validation and a local rehearsal are done) | D06.L |
| BLK-07 | `www` certificate | Platform owner | Add `www` in Vercel domains (still failing TLS) | I07 |
| BLK-10 | Monitoring activation | Platform owner | Set `UPTIME_MONITOR=on`, the alert webhook and the external monitor after cutover | I08.L |
| BLK-11 | Baseline vs live schema | Platform owner | Compare the baseline against the live production database at cutover | D01.L |
| BLK-12 | Approved hero asset | Owner | Supply `apps/web/public/images/hero/makkah-approved.webp` | N-BRD-1 |
| BLK-13 | Render decommission | Platform owner | Suspend then delete the legacy service after an authorized cutover and a backup | N-OPS-5 |

## Closed by this loop

| Was | Now |
|---|---|
| BLK-08 — traveler↔pilgrim link was "a product decision" | Implemented as an invitation accepted by the verified invited account (D-022); XT-003 closed. |
| XT-R06, R07, R08, R09, R13 — five unbuilt frontend surfaces | Built and verified in the browser (Google sign-in against a stub, verification, onboarding + KYC, Stripe Payment Element, account settings). |
| XT-R02 — capability-driven guards | One route→capability table; no role-name authorization remains in the web app. |
| W31 — "no automated audit or screen-reader session" | axe WCAG 2.2 AA sweep (0 violations) and a real Orca screen-reader session. |
| R05, P06, P07, P08, D08, O04, I08 (engineering half) | All implemented and verified. |
