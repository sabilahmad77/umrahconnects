# Scorecard

> **Superseded by the Engineering 100 loop (2026-10-01).** Current scores are in
> `ENGINEERING_100_SCORECARD.md` and `LAUNCH_READINESS_SCORECARD.md`, derived from
> `ENGINEERING_100_REGISTER.json`. This file remains the record of the 2026-09-18 state.
 — web integration closure loop (2026-09-18)

Supersedes the core-track scorecard of 2026-09-17, which scored the backend
alone. This one scores the merged system.

| Measure | Value |
|---|---|
| Mandatory gates (SECURITY_GATES.md) | **9 / 9 PASS** |
| Verified execution score (INTEGRATION_EXECUTION_MATRIX.md) | **109 / 131 = 83.2** |
| Target for a launch recommendation | ≥ 95 |
| Items not passed | 9 BLOCKED (8 external + 1 credential revocation), 13 DEFERRED / NOT DONE |
| Known open P0 code defects | **0** |
| Known open P1 code defects | **0** |

## Where the 22 not-passed items sit

| Group | Count | Nature |
|---|---|---|
| Frontend surfaces never built | 5 | Google sign-in, email verification, provider onboarding + KYC, Stripe Elements checkout, settings account actions. Every one has a finished, tested server contract waiting for it. |
| Frontend hardening not attempted | 2 | Capability-driven UI guards and full WCAG certification. |
| External credentials / access | 8 | Google, SMTP, Stripe, R2, off-site backup, KVM host + DNS, `www` certificate, and the traveler↔pilgrim product decision. |
| Credential revocation | 1 | Two exposed tokens in pushed history. |
| Core backlog, justified | 6 | RLS defence in depth, preferences model, response-envelope consistency, seed realism, orphan cleanup, uptime monitor. |

## Trend

| Date | Score | Note |
|---|---|---|
| 2026-09-17 (audit baseline) | 25 of 73 capabilities verified (34 %) | 3 P0, 9 P1 open |
| 2026-09-17 (core track) | 76/90 = 84.4 | backend only; frontend explicitly out of scope |
| 2026-09-18 (this loop) | **109/131 = 83.2** | denominator widened to include the web; 0 open P0/P1 code defects; 9/9 mandatory gates pass |

The score went down slightly because the denominator grew to include the web
items the core track excluded, not because anything regressed. On the core
track's own 90 items the merged system still scores 76.
