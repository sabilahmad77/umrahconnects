# A12 — independent acceptance review

A12 implemented none of the code in this loop. Its job was to disbelieve the reports and check them.
Nothing below was copied from another worker's numbers: every gate was re-run in A12's own worktree
(`…/eng100/a12`, branch `eng100/a12`) against its own database copy, and every probe was written by A12.

* **What was audited.** The candidate at `2e3857b`. The candidate has since moved to `3f2243f`, but
  `git diff --name-only 2e3857b..3f2243f` touches no file under `platform/api/src` or
  `apps/web/{app,components,hooks,lib,middleware}` — the three newer commits are A10's evidence, the
  defect log and register tooling. The gates, builds and probes therefore cover `3f2243f`'s entire
  shipping surface.
* **Read-only towards the candidate.** The coordinator's stack on `:4300`/`:3300` was never restarted
  and nothing was written in its worktree. A12's own processes ran on `:4413`/`:3413` and a
  stripe-mock container on `:12412`; all were stopped, and the container removed.

## Documents here

| File | What it holds |
|---|---|
| `GATES.md` | every mandatory gate, the exact command, and its outcome — typecheck, lint, unit, the full e2e as the runtime role, both production builds, the cold boot, migration validation and the secret scan |
| `PROBES.md` | every adversarial probe and its result, the direct PostgreSQL probe of the runtime role, and the findings |
| `gate-logs/` | the raw output of each command in `GATES.md` |
| `browser/` | the nine browser checks, their screenshots and `summary.json` |

## Verdict in one paragraph

Every mandatory gate passes on re-run, including the two production builds and a cold boot from the
built artifacts, and the migrations apply to an empty database with zero drift and no destructive
statement. The security claims that matter hold up under attack that the implementers' own suites do
not attempt: a 5-identity × 30-query-shape sweep over every list, export and report route leaked
nothing; a blind write sweep over every mutating route with the victim's ids substituted left the
victim organization byte-identical; thirteen spellings of a platform capability and a grant forged
straight into the database all failed to mint one; invitation tokens survived replay, expiry,
revocation and every wrong identity; money refused client-chosen amounts, IDOR, double capture,
out-of-bounds refunds, cancelled-booking payment and forged webhooks. No green-washing was found:
no test is skipped or weakened (the one `it.fails` in the loop was converted to `it` because the
defect was *fixed*), no feature is a placeholder, the Google stub says in the UI that it is a stub,
and no credential appears anywhere including the two build outputs. Three things are open: the
duplicate-submit guard is per-tab client state with no server-side idempotency (A12-1), reference
numbers are five random digits in a platform-wide unique space with no retry (A12-3), and A10's
DEF-004 is narrowed rather than closed although the commit says otherwise (A12-5).

## Register (`ENGINEERING_100_REGISTER.json`)

At the time of this review the register is **still entirely OPEN** — 175 rows all `OPEN`,
`candidate.revision: null`, `updatedAt 2026-09-18T12:23:52+00:00` — so there is no filled arithmetic
to check. What A12 could verify, it did, with its own re-derivation
(`audit/a12-register-check.py`, which recomputes the three views from the raw rows without importing
the coordinator's scorer):

* the three views agree with `audit/eng100/register.py score` exactly (0/131, 0/34, 0/155, 0/168);
* the historical ledger holds exactly **131** original rows, with no duplicate ids;
* the provider-dependent rows are split as the requirement text demands: **A11, A13, T04, O03, I06,
  I07** are launch-only; **S23, W40, D06, I08, W13, W14, W16** are parents whose children and
  cross-references (`S23→W40.L`, `W13→A11`, `W14→A13`, `W16→T04, N-PRV-1`) all resolve;
* denominators follow from the rows: engineering **155**, launch **168**, new **34**;
* `register.py score` itself refuses a PASS without evidence and without a verifier, and averages
  or excludes nothing. A12's script adds one check the coordinator's does not: **every path-shaped
  evidence reference on a PASS row must resolve on disk**.

Two things to fix before the register is scored, both visible in the coordinator's not-yet-run
`audit/eng100/fill_register.py`:

1. Its `E2E` shorthand says **"492 passed, 5 skipped"** for `REV = '2e3857b'`. A12 measured
   **494 passed, 5 skipped** on that exact revision (`gate-logs/api-e2e-full.txt`), and `2e3857b`
   changed no file under `platform/api/test`. The register's headline number is two short of what
   the revision it names produces.
2. It cites `evidence/eng100/a01/e2e-candidate.txt`, `…/gates.txt` and `…/builds.txt`; the directory
   `docs/control-tower/evidence/eng100/a01/` does not exist. `audit/a12-register-check.py` fails on
   evidence paths that do not resolve.

It also names **A12 as the independent verifier** on most rows. The final report states exactly which
requirement IDs A12 is willing to stand behind and which it is not; rows outside that list must not
carry A12 as their verifier.
