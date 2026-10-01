# Integration Execution Matrix

> **Superseded by the Engineering 100 loop (2026-10-01).** Current scores are in
> `ENGINEERING_100_SCORECARD.md` and `LAUNCH_READINESS_SCORECARD.md`, derived from
> `ENGINEERING_100_REGISTER.json`. This file remains the record of the 2026-09-18 state.
 — web closure loop

Scored requirements for the loop that merged the Claude core track (`platform/api`)
and the Codex web track (`apps/web`) into `integration/web-final`.

The denominator is **every item**: the 90 carried from the core track's
`EXECUTION_MATRIX.md` plus the 41 web/integration items below. BLOCKED, DEFERRED
and NOT DONE all count as **not passed**. Nothing is excluded, and no item is
averaged away.

| Status | Core (90) | Web/integration (41) | Total (131) |
|---|---|---|---|
| PASS | 76 | 33 | **109** |
| BLOCKED (external credential / access / product decision) | 8 | 1 | 9 |
| DEFERRED / NOT DONE (engineering not attempted this loop) | 6 | 7 | 13 |
| FAIL (known defect left open) | 0 | 0 | **0** |
| **Verified score** | | | **109 / 131 = 83.2** |

The core track's own 90 items are unchanged except where this loop re-verified
them on the merged branch; see "Re-verified from the core matrix" below.

---

## Web / integration items

| ID | Area | Requirement | Status | Evidence |
|---|---|---|---|---|
| W01 | Integration | Both tracks merged with no lost work and no unresolved conflict | **PASS** | merge `001553a`; file sets disjoint except `pnpm-lock.yaml` |
| W02 | Build | Web typecheck | **PASS** | `tsc --noEmit` exit 0 |
| W03 | Build | Web lint | **PASS** | `eslint app components hooks lib middleware.ts` exit 0 |
| W04 | Build | Web tests | **PASS** | 58/58 (39 inherited + 19 new contract guards) |
| W05 | Build | Web production build | **PASS** | `next build` exit 0, 76 static pages, middleware 26.4 kB |
| W06 | Build | Production build refuses to start without `API_PROXY_ORIGIN` | **PASS** | build without it exits 1 with the named error |
| W07 | Security | XT-R01 refresh token is never held by page scripts | **PASS** | login body has no `refreshToken`; cookie httpOnly; empty-body refresh + logout verified over HTTP and in the browser |
| W08 | RBAC | XT-R02 post-login routing from real server roles | **PASS** | browser, all seven: PILGRIM→/travel-plan, OPERATOR_ADMIN→/dashboard, HOTEL_MANAGER→/hotel-dashboard, TRANSPORT_MANAGER→/transport-dashboard, VISA_OFFICER→/visa-dashboard, FINANCE_MANAGER→/finance-dashboard, SUPER_ADMIN→/admin-dashboard |
| W09 | RBAC | XT-R02 UI guards driven by server capabilities rather than role names | **NOT DONE** | `lib/workspace-access.ts` still matches role names; `/auth/me` permissions unused |
| W10 | Security | XT-R03 private documents opened through short-lived signed URLs | **PASS** | visa + KYC wired to `/documents/*/url`; acceptance: upload → `private:` reference → signed fetch 200 → tampered signature 401 |
| W11 | Fake data | XT-R04 client-side demo personas gone | **PASS** | login page is email+password only |
| W12 | Security | XT-R05 proxy secret and trustworthy client IP | **PASS** | `apps/web/middleware.ts`; two clients get independent rate-limit buckets (429 at 31), a forged header is discarded |
| W13 | Auth | XT-R06 Google Sign-In UI | **NOT DONE** | no `/auth/callback` page; backend flow complete and tested |
| W14 | Auth | XT-R07 email verification UI | **NOT DONE** | no `/verify-email` page or unverified banner; backend complete |
| W15 | Onboarding | XT-R08 provider onboarding + KYC submission UI | **NOT DONE** | no caller for `/onboarding/organization` or `/tenants/me/kyc` |
| W16 | Payments | XT-R09 Stripe Elements checkout UI | **NOT DONE** | no `@stripe/*` dependency; sandbox intent/confirm path works |
| W17 | Contracts | XT-R10 request contracts aligned across every module | **PASS** | booking/invoice transitions, refund routing, visa decisions, enums — all covered by `tests/server-contracts.test.ts` |
| W18 | Media | XT-R11 image hosts corrected and R2 media host admitted | **PASS** | `next.config.mjs` remote patterns; `umrahconnect.io` spelling fixed |
| W19 | Admin | XT-R12 PLATFORM organization type displays correctly | **PASS** | browser: platform organization listed and labelled in `/admin-tenants` |
| W20 | Settings | XT-R13 change-password and sign-out-everywhere in settings | **NOT DONE** | settings page remains read-only |
| W21 | Auth | XT-R14 password hints match the server rule | **PASS** | shared `lib/password-policy.ts`, asserted against the register DTO |
| W22 | Money | Listing creation prices at face value, not 100× | **PASS** | `marketplace-view.tsx` sends major units; server converts once |
| W23 | Auth | An account in more than one workspace can sign in | **PASS** | workspace list read from `error.details.tenants`; reproduced with a real two-workspace account |
| W24 | Fake data | Listings show their own media and their real seller | **PASS** | stock photography removed; `imageUrls` / `vendor.name`; confirmed in the browser |
| W25 | Fake data | Notification bell reflects real notifications | **PASS** | envelope unwrapped in `use-platform.ts` |
| W26 | Fake data | Social bookmark reflects server state | **PASS** | feed returns the viewer's own save; client seeds from it |
| W27 | Fake data | Admin tiles are platform-wide, not page-scoped | **PASS** | `/admin/stats` returns `tenants.byStatus` and `usersByStatus`; browser shows 11/11 consistent |
| W28 | UX | Validation failures render as a sentence, not raw JSON | **PASS** | `lib/api-error.ts` across 49 call sites; unit-tested |
| W29 | Honesty | Fields the server ignores are not offered as inputs | **PASS** | hotel room count and booked seats removed from edit forms |
| W30 | Responsive | No horizontal page scroll at 1440/1280/1024/768/390/360 | **PASS** | measured `scrollWidth` vs `clientWidth` across operator, provider and platform routes |
| W31 | Accessibility | Full WCAG certification | **NOT DONE** | swept routes have zero unnamed controls, but no automated audit or screen-reader session |
| W32 | Browser QA | Console and network clean on the integrated app | **PASS** | zero console errors; all `/proxy-api` calls 200; no request loops |
| W33 | Tenant isolation | Cross-tenant read/write/delete refused for every role pair | **PASS** | acceptance harness, A/B organizations for hotel, transport, visa, operator, traveler |
| W34 | Super Admin | Platform routes refused to every non-platform identity | **PASS** | 63 direct API probes + anonymous; browser boundary page |
| W35 | Database | Writes persist across session and process boundaries | **PASS** | create → read → fresh login → list → soft delete → status confirmed |
| W36 | Money | Booking totals are server-authoritative | **PASS** | tampered total 400; server figure matches; checkout charges the server total |
| W37 | Storage | Document authorization holds end to end | **PASS** | signed URL serves, tampered signature refused, cross-tenant and traveler refused |
| W38 | Security | Sign-out-everywhere revokes same-second tokens | **PASS** | defect found, fixed, regression test with no sleeps |
| W39 | Reproducibility | Cold boot from the canonical worktree passes the full smoke | **PASS** | fresh PIDs in the integration worktree; 65/65 + 210/210 |
| W40 | Secrets | Credentials removed from version control | **BLOCKED** | file untracked and ignored locally, but the tokens are in pushed history — only revocation at the provider closes this |
| W41 | E2E | Every role's core journey walked in a browser | **PASS** | all seven roles signed in through the real form; landing page and scoped data confirmed for traveler, operator, hotel, transport, visa, finance and Super Admin |

---

## Re-verified from the core matrix

These carried items were re-run on the merged branch rather than trusted:

| ID | Note |
|---|---|
| S18 | Session revocation was recorded PASS but did not hold for a token minted in the same second as the revocation. Defect fixed this loop (W38); the PASS now stands on a test that does not sleep between steps. |
| S27 | "Client IP trust behind the web proxy" was PASS with the web half pending. The web half now exists and is verified (W12). |
| Q04 | E2E suites re-run on the merged branch: 146/146 (was 145; one regression test added). |
| Q07 | Runtime QA re-run: 65/65, including the nine payment and hotel checks the core run skipped for want of seeded data. |
| S23 | "No secrets in repository" did not hold: `.claude/settings.local.json` was tracked and contains credential-shaped tokens. See W40. |

## What would move the score

| Item | Needs | Points |
|---|---|---|
| W13, W14, W15, W16, W20 | Frontend build-out against contracts that already exist server-side | +5 |
| W09 | Switch UI guards to server capabilities | +1 |
| W31 | Automated WCAG audit + screen-reader pass | +1 |
| W40 | Revoke both exposed tokens at GitHub and Render | +1 |
| A11, A13, T04, O03, D06, I06, I07, P06 | External credentials / access / product decision (core track) | +8 |
| R05, P07, P08, D08, O04, I08 | Deferred core backlog | +6 |

With the seven open web items closed the score is 116/131 = 88.5. With the external
blockers as well it is 124/131 = 94.7, and the deferred backlog takes it to
131/131.
