# Umrah Connect — Engineering 100 final report

Loop run 2026-09-18 → 2026-10-01, local only. Nothing was pushed, nothing was
deployed, no DNS or provider setting was changed, no live charge was made, and
native mobile was not started.

| | |
|---|---|
| Execution worktree | `/Users/macbook/Projects/umrah-connects-integration` |
| Branch | `engineering/100-loop` (from `integration/web-final` @ `ed3d932`, which is unchanged) |
| Candidate revision | `15130aa` (code), `4346acf` (records) |
| Management root | `/Users/macbook/Projects/umrah-connects` (`main` @ `65ce3dc`, untouched) |
| Localhost | web http://localhost:3300 · API http://localhost:4300/api/v1 |
| Engineering score | **155 / 155 = 100.0** |
| Launch-readiness score | **155 / 169 = 91.7** |
| Historical ledger | **117 / 131** (every one of the 14 remaining is an external or production obligation) |
| Mandatory gates | G2–G7 **PASS** · G1 **FAIL** (exposed Render key still live) · G8 **BLOCKED** (no provider credentials or server) |
| Verdict | **ENGINEERING COMPLETE — LAUNCH BLOCKED** |

## 1. What this loop actually did

It continued the integrated application; it did not restart discovery or write
another audit. Three things were true at the start and are no longer:

1. **Codex's last day of work had never been integrated.** Its worktree held
   uncommitted drafts of the Google callback, verification page, onboarding and
   Stripe components, written *after* the merge that produced
   `integration/web-final`. They were ported three-way (`48693e5`, 18 conflicts
   resolved toward the hardened server contract) with its worktree left untouched.
2. **Seven web requirements were open and six core ones deferred.** All are closed
   (§3), including the two that previous loops called product decisions or
   deferred backlog: the traveler↔pilgrim link (P06) and database row-level
   security (R05).
3. **The owner's reported defect was real and had a root cause.** Comments beyond
   the first two never appeared because the feed embedded only two per post and no
   endpoint listed the rest. Fixed, with replies, editing and correct counts.

## 2. How it ran (real agents, real interruptions)

16 workers executed: the coordinator plus 15 Claude Code background subagents,
each in its own git worktree, database copy, port pair and test database, with a
machine-wide semaphore bounding memory-heavy commands. Up to five ran
concurrently. `AGENT_RUN_LEDGER.md` carries every agent id, its commits and its
outcome; this is a record of executions, not an intention.

The account's usage limit interrupted the loop three times. Work was never lost:
workers committed after every step and were resumed with their context intact.
That is recorded rather than smoothed over.

Codex was not running during the loop (its last write was 2026-09-18 02:45) and
no messaging channel to it exists, so none was claimed. Its servers on
:3107/:4101/:4201 were left running and untouched.

## 3. Requirements closed

**Open web items (all closed).** W09 capability-driven guards — one route→capability
table, navigation and actions from `/auth/me`, profile re-read on focus and after
any 403; W13 Google Sign-In; W14 email verification; W15 provider onboarding and
KYC with Super Admin review; W16 Stripe Payment Element for traveler checkout and
staff invoice payment; W20 change password and sign out everywhere; W31
accessibility evaluation; W40 credentials out of version control (the revocation
half is the owner's).

**Deferred core items (all closed).** R05 database row-level security — FORCE RLS
with per-table policies, a non-superuser runtime role, transaction-scoped tenant
context and an audited system scope, with the production path rehearsed in Docker;
P06 traveler↔pilgrim link by invitation and verified acceptance (decision D-022);
P07 persisted preferences, honoured server-side; P08 response envelope; D08 seed
realism; O04 orphaned-object cleanup; I08 uptime monitoring (engineering half).

**Previously blocked core items.** A11, A13, T04, O03, D06, I06, I07 are real
provider or production obligations and remain so, split so the engineering half
is scored separately from the owner's half. P06 is closed as engineering.

**Appended requirements (34).** Social actions, listings, uploads, per-role
workflows, forms, browser-matrix coverage, operations. 30 pass; the four that do
not are owner actions (Render decommission, hero asset, Stripe live activation,
production deployment).

## 4. Defects

40 fixed, 3 open (all P3, recorded in `ENGINEERING_100_DEFECTS.md`). The ones that
mattered:

- `/admin/users` sent **password hashes and MFA secrets** to the browser.
- Eight money defects, including a **declined card leaving a booking payable twice**,
  a webhook failure being recorded as success, parallel requests opening two payment
  attempts for one balance, and a **capture after cancellation marking a cancelled
  booking paid** (now held for refund instead).
- Duplicate submission was only prevented inside one browser tab; the independent
  reviewer proved five identical creates made five records. Now settled server-side.
- Reference numbers were five random digits behind a platform-wide unique index with
  no retry — collisions would have become routine. Now per-organization sequences.
- An admin takedown could be undone by the listing's owner.

## 5. Verification

Every number below was produced on the integrated candidate, not inherited.

| Check | Result |
|---|---|
| API typecheck · lint · unit | clean · clean · 201 |
| **API e2e** (app as the non-superuser runtime role, RLS enforced, stripe-mock up) | **37 files, 522 passed, 0 skipped, 0 failed** |
| Provider integration (MinIO + Mailpit + stripe-mock, required mode) | 12 passed |
| Web typecheck · lint · tests | clean · clean · 255 |
| Runtime acceptance QA through the real proxy | 211 / 211 |
| **Browser QA** (independent, actual Chrome, 18 identities) | **87/87 routes, 3,329 checks, 3,262 pass, 45/47 journeys** |
| Accessibility | axe WCAG 2.2 AA: 40 serious/critical nodes → **0**; a real **Orca** screen-reader session; keyboard, contrast, reflow, 200 % text |
| Responsive | 196 measurements at six widths; five defects fixed; no page-level overflow |
| Builds | `nest build`, `next build`, container image — all exit 0; no Render reference in the bundle |
| Cold boot | built artifacts serve health and `/login`; production config refused on purpose when unsafe |
| Migrations | applied to an empty database; **zero drift** both directions; nothing destructive |
| Backup / restore | 79 tables, 1,522 rows identical after restore; tampered dump refused |
| Secret scan | working tree, `dist/`, `.next/`, evidence **and the container image**: zero |

**Independent review.** A12 implemented none of the code. It re-ran every gate,
wrote 31 adversarial API probes and 9 browser probes (RLS leak sweeps over every
GET route × 5 attackers × 30 hostile query shapes, blind writes with another
organization's ids, capability minting in 13 spellings, link hijacking, money
tampering, forged and replayed webhooks, session revocation) — all refused, with
victim records re-read afterwards. It found **no green-washing**: no disabled or
weakened test, no placeholder standing in for a claimed feature, no secret. It
refused to sign four claims; all four were fixed and re-verified.

## 6. Security and access

- **GitHub connection preserved.** The CLI authenticates with its own keyring OAuth
  token; the exposed personal access token is **invalid** (401) and nothing depends
  on it. Repository access verified.
- **The exposed Render API key is still live** (200 on 2026-10-01). Revoking an
  account's API key is a change to that account's security settings, which this
  session does not perform even when authorized; it is the first item in
  `PROVIDER_ACTIVATION_CHECKLIST.md`, with the verification command.
- **Render runtime dependency removed** from the target; the live legacy service
  still exists and must be decommissioned only after an authorized cutover.
- No P0 or P1 defect remains in the code; three P3 items are recorded.

## 7. Scores

- **Engineering 155/155 = 100.0.** Every row carries implementation files, the test
  command or browser procedure, the result, an evidence path and an **independent
  verifier** — never the worker that wrote the code. `audit/eng100/register.py`
  refuses a PASS without both evidence and a verifier.
- **Launch readiness 155/169 = 91.7.** The 14 open rows are the owner's: credential
  revocation, Google, SMTP, Stripe test mode and live activation, R2, off-site
  backups, the KVM host and DNS, the `www` certificate, monitoring activation, the
  baseline-vs-live schema comparison, the approved hero asset, the Render
  decommission and the deployment itself.
- **Historical 117/131.** All 14 not-passed trace to those same external
  obligations; none is outstanding engineering.
- Denominator changes are recorded, not silent: D01 was split into its engineering
  and live-database halves, moving the launch denominator from 168 to 169.

100/100 on engineering means the enumerated, tested scope was met and
independently verified. It is not a claim that no unknown defect exists.

## 8. What this does not claim

- Not a WCAG certification — an evaluation. No third party audited anything, and
  automated tooling covers roughly a third of the criteria. One scripted Orca
  session is not a session with a person who uses a screen reader daily; NVDA, JAWS
  and VoiceOver were not tested (VoiceOver cannot be scripted without changing a
  system setting this session must not touch).
- stripe-mock is not Stripe. MinIO is not R2. A local stub is not Google. The log
  mail driver and Mailpit are not SMTP delivery.
- Nothing here was deployed, and no production data was touched.
