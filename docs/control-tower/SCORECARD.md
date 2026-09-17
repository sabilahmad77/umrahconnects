# Scorecard — Claude core track (2026-09-17)

| Measure | Value |
|---|---|
| Mandatory gates (SECURITY_GATES.md) | **8 / 8 PASS** |
| Verified execution score (EXECUTION_MATRIX.md) | **76 / 90 = 84.4** |
| Target for a launch recommendation | ≥ 95 |
| Items not passed | 8 BLOCKED (external), 6 DEFERRED |

## What would move the score

| Item | Unblocks with | Points |
|---|---|---|
| A11 Google against real credentials | Google Cloud OAuth client | +1 |
| A13 Production email | SMTP mailbox credentials | +1 |
| T04 Stripe test mode | Stripe test secret, publishable and webhook secret | +1 |
| O03 Real R2 bucket | R2 buckets + API token | +1 |
| D06 Off-site backups | R2 backup bucket + rclone remote | +1 |
| I06 Production API | KVM server access, DNS record, deployment authorization | +1 |
| I07 `www` certificate | Vercel domain configuration | +1 |
| P06 Traveler visa status | product decision (pilgrim ↔ user link) | +1 |
| Deferred items (RLS, preferences, envelope, seed realism, orphan cleanup, uptime monitor) | later loops | +6 |

With all eight external items resolved the score becomes 84/90 = 93.3. Reaching 95 also needs at least two deferred items done (e.g. the uptime monitor at cutover and the orphan cleanup job).

Score trend: 2026-09-17 audit baseline — 25 of 73 functional capabilities verified (34 %), 3 P0 and 9 P1 open. Now — 0 open P0/P1 code defects, all mandatory gates pass, 84.4 % of the 90-item matrix verified.
