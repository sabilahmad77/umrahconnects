# eng100 A09 evidence — Render isolation, KVM readiness, backups/restore, uptime monitoring

| File | What it proves |
|---|---|
| `render-inventory-before.txt` | Every Render reference before the change (115 hits in 48 files, 19 `onrender.com`) |
| `render-inventory-after.txt` | Every remaining mention classified; all runtime/deploy surfaces at 0; no code reads a Render variable |
| `container-build-smoke.md` | Image build and hardening, Render values refused, migrations from empty, stack in bundled-proxy mode, HTTPS smoke and sign-in, restart window removed |
| `blueprint-validation.md` | Compose (both proxy modes) + port policy, `caddy validate`, shellcheck, actionlint, `host-setup.sh` idempotency and `systemd-analyze verify` on Ubuntu 24.04 |
| `backup-restore-rehearsal.md` | Original script defects reproduced; backup-directory and `OFFSITE_REMOTE` contract; off-site copy (S3-compatible stand-in, not R2); restore into a separate container with identical per-table counts and hashes; drill, refusals, replace |
| `monitoring.md` | Uptime probe pass/fail paths (incl. the Render-header guard), host health check alert transitions, webhook payloads, O04 scheduling wiring |
| `cleanup.txt` | Every disposable container, volume, network, image and file removed |

Not verified here (needs the owner or a real provider): Cloudflare R2 itself, Let's Encrypt issuance on a public host,
DNS, Vercel, the GitHub-hosted run of `uptime.yml`/`infra-ci.yml` (linted only), and A06's cleanup command inside
this image (lands with the merge of `eng100/a06` 28bab77).
