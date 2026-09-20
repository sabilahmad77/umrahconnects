# A11 — accessibility (W31) and responsive (W30) acceptance

Everything here was produced against this worktree's own stack (web :3411, API :4411,
database `umrah_eng100_a11`, the API connecting as the non-superuser runtime role so
row-level security is live), signing in through the real `/login` form as the QA fixture
identities. No credential value appears in any file: the Orca runner scrubs its outputs
and a check in the commit step re-verifies it.

| Folder | What is in it |
|---|---|
| `axe/` | `SUMMARY.md` — the before/after audit with the WCAG mapping; `axe-before.json`, `axe-after.json` — every violation with rule, criterion, impact, route, state and node; the console logs of both sweeps |
| `keyboard/` | `CHECKLIST.md` — every keyboard, focus, error-announcement and authentication check with its result; `keyboard-before.json` / `keyboard-after.json`; `nontext-after.json` — measured non-text contrast and target sizes |
| `orca/` | `ATTEMPT_LOG.md` — what the screen-reader session was, what had to be solved to get Orca speaking, what it said and what it cannot claim; `run-before/` and `run-after/` — the driver log, the step-by-step transcript and Orca's own speech output |
| `responsive/` | `RESULTS.md` — the six widths for every role after the fixes, reflow at 320 px, text at 200 %, the landing hero; `RESULTS-before.md` — the run against the candidate build that found the defects; both runs' raw JSON and logs; `screenshots/` |
| `DEFECTS-OBSERVED.md` | Things found while auditing that belong to someone else: the candidate stack serving chunk 400s, and two assistive-technology behaviours worth knowing about |
| `tools/` | The scripts that produced all of it, so any of it can be re-run: `audit.cjs` (axe sweep), `keyboard.cjs`, `nontext.cjs`, `responsive.cjs`, `contrast-scan.cjs` (static colour-pair scan), `lib.cjs`, and `orca-lab/` (the Docker screen-reader lab) |

## Re-running

```bash
cd $TMPDIR/uc-a11 && npm install axe-core          # Deque's own package
BASE=http://localhost:3411 node audit.cjs axe.json  # the sweep
BASE=http://localhost:3411 node keyboard.cjs keyboard.json
BASE=http://localhost:3411 node nontext.cjs nontext.json
BASE=http://localhost:3411 node responsive.cjs responsive.json
cd orca && docker build -t uc-a11-orca:local . && docker build -t uc-a11-orca-lab:local -f Dockerfile.lab . \
  && docker build -t uc-a11-orca-lab:local -f Dockerfile.lab2 . && docker build -t uc-a11-orca-lab:local -f Dockerfile.lab3 . \
  && ./run.sh travelerA                              # the screen-reader session
```

The scripts read the QA identities from `.project/local/qa-credentials.json`; they never
print a password, and the Orca runner deletes the identity file it hands to the container
and scrubs the run's output afterwards.

## What this is not

This is an evaluation against WCAG 2.2 AA, recorded honestly — not a certification.
No conformance claim is made for the product, and no audit by a third party took place.
The screen-reader evidence is one scripted Orca session on Linux, not a session with a
person who uses a screen reader daily, and not VoiceOver, NVDA or JAWS.
