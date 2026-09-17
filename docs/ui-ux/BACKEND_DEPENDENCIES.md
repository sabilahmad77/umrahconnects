# Backend dependencies

> **Reconciled by the web integration closure loop (2026-09-18).** Every row below
> was recorded against the pre-hardening backend. Each has now been reproduced
> against the current API on `integration/web-final`:
>
> | Original dependency | Status now |
> |---|---|
> | Signup provisions no role | **RESOLVED** — registration always creates a Traveler in the community organization; verified at runtime (`roles: ['PILGRIM']`, marketplace readable, `/admin` and `/pilgrims` refused). |
> | Personal group membership | **RESOLVED** — `GET /groups/mine` exists and is traveler-scoped. |
> | Personal visa status | **STILL BLOCKED — product decision.** Visa applications belong to organization pilgrim records with no consented link to a traveler account (BLK-08). |
> | Server-authoritative marketplace pricing | **RESOLVED** — the server computes the total; a mismatched client figure is rejected; unsupported pricing models refuse rather than guess. Verified at runtime, including a 1-cent tampering attempt. |
> | Settings preferences / credentials | **STILL DEFERRED** — no preferences model. Change-password and sign-out-everywhere endpoints exist; the settings UI for them is not built (XT-R13). |
> | Google sign-in and email verification | **CONTRACT CHANGED** — both are implemented and tested server-side. The frontend pages are not built (XT-R06, XT-R07). |
> | Platform-admin restriction | **RESOLVED** — every `/admin/*` route requires a `platform:*` capability. 63 direct probes across nine non-platform identities were all refused; the operator account that previously returned global records now gets 403. |
> | Legitimate accounts for every role | **RESOLVED** — `seed-demo-roles.ts` plus `seed-isolation-pairs.ts` give a real account per role and a genuine second organization per type. |
> | Local API availability | **RESOLVED** — documented ports and launch configurations; the integrated stack runs on :4300/:3300. |
>
> The original text is kept below as the record of what the frontend track found.

Backend source was read but not modified. Runtime smoke tests use the existing compiled API on isolated port 4101; no seeds, migrations, purchases or domain mutations are submitted.

| Route / screen | Required endpoint / behavior | Actual inspected behavior | Severity / frontend response |
|---|---|---|---|
| /signup → /login / onboarding | POST /auth/register must provision an allowed role or return an explicit activation state | register creates a user and token; no role assignment is present in inspected creation code. roleInterest does not establish authorization. | RELEASE BLOCKER: signup explains role interest; login rejects empty-role workspace state with setup/support message. Backend must define activation. |
| /travel-plan personal groups | A current-user membership/itinerary query | GET /groups is tenant-scoped, not proof of current-user membership | Capability dependency: personal groups are unavailable; tenant-wide records are no longer presented as personal. |
| /travel-plan personal visas | A current-user application status query | GET /compliance returns tenant application records | Capability dependency: personal tracking unavailable; contact operator message. |
| /marketplace/[id] / booking review | Server quotation / authoritative price validation by model, dates and party size | booking creation accepts client totalAmountCents, otherwise multiplies price by party size regardless of pricing model | RELEASE BLOCKER for trustworthy pricing: frontend estimates only PER_PERSON/PER_GROUP; nightly/custom require inquiry. Backend must calculate/validate totals and availability. Frontend estimates are not payment confirmation. |
| /settings preferences / credentials | Persisted user notification preferences, credential metadata and supported update endpoints | No corresponding inspected contracts | Intentionally unavailable; no simulated saves or fabricated API key. Profile link uses actual endpoint. |
| /login Google / email verification | Server OAuth and verification contracts | No implemented routes found in inspected auth controller | NOT APPLICABLE to current frontend; no fake login/verification control. |
| /admin-* platform governance | Server restriction for cross-tenant administration | Seeded OPERATOR_ADMIN has core tenant/user permissions; admin controller uses those permissions for global reads. Local production-build browser QA returned global administrative records to this operator account. | RELEASE BLOCKER: frontend mirrors Super Admin navigation boundary and blocks rendering for other roles, but this cannot secure the API. Backend track must enforce platform scope. |
| Role acceptance / all protected routes | Legitimate accounts for HOTEL_OWNER, TRANSPORT_MANAGER, COMPLIANCE_OFFICER, FINANCE_MANAGER, PILGRIM, SUPER_ADMIN and staff/sub-agent | Inspected seeds establish operator-admin credentials; no equivalent account set for those roles | Acceptance dependency: do not fabricate personas or claim role-specific authorization verification. Operator-account cross-route behavior is documented separately. |
| Local QA availability | Existing API /api/v1 | Port 4100 refused connection during test; frontend sign-in displayed failure | Environment dependency resolved for smoke testing by starting existing compiled API on 4101, without touching source or other ports. |

Additional runtime failures are recorded in release-evidence/final-route-checks.json and the completion matrix. Backend remediation remains with the other track; no server business/security contracts are changed here.
