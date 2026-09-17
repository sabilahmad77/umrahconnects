# Implementation scope draft — design gate only

17 September 2026. **NOT AUTHORIZATION TO IMPLEMENT.** This document makes the future work reviewable; no direction is selected and no production code, CSS, tokens, API, authentication, database or infrastructure is changed in this discovery loop.

## Entry conditions

Generate the four representative visuals from each A/B/C prompt pack, compare the same screen across directions, and obtain the product owner's direction selection. Resolve the product decisions below before treating proposed screens as implementation requirements. Authorize the implementation phase separately. Coordinate with the active engineering session before assigning files or creating changes.

The visual mockups must carry their design-concept label and honest unavailable/empty data. They cannot validate working booking, supplier verification, payments, integration availability, role permissions or accessibility.

## Product decisions and dependencies

| Decision | Evidence and dependency | Required outcome before affected UI work |
|---|---|---|
| Traveler entry | Current pilgrim default is `/social`; travel-plan and personal booking surfaces exist | Choose whether a dedicated personal overview replaces that entry; define own-user journey data and navigation |
| Signup roles | Source shows role-interest selection and registration/role-assignment ambiguity | Engineering establishes the actual provisioned role, organization and verification contract; do not solve this with cosmetic role labels |
| Workspace scope | Seven dashboard types, nine frontend role values; local persona switch reuses an operator session | Verify each real role/tenant's data and permissions in a separate authorized test environment |
| Transaction commitment | Listing booking, offers, operational bookings and payment-recording fragments exist | Define request vs confirmed booking vs paid state; authoritative currency, units, duration, availability, fees, cancellation and recoverable errors |
| Payment/integration copy | Marketing and integration wording can exceed demonstrated runtime capability | Owner confirms the supported provider/integration behavior, evidence, availability and roadmap labeling |
| Proof and community content | Static metrics, fallback ratings and unmarked social illustrations | Supply evidence or explicitly label/remove claims; no invented testimonials, badges or partner logos |
| Metrics | Static growth/health assertions and differing approval presentations | Define source, scope, time range and denominators; separate unavailable, stale, pending and empty |
| Languages/content | Arabic typography and partial RTL provisions exist | Confirm target languages, approved translations and full RTL test scope; retain valid published content |
| Image rights | Existing identity/assets are preserved | Confirm approved travel/property photography and usage rights before replacing or publishing imagery |

## Proposed sequence after selection and explicit authorization

| Stage | Scope | Reviewable exit condition |
|---|---|---|
| 1 — Foundations and representative prototype | Selected direction's semantic palette, type/spacing/radius rules, navigation and state examples; public landing + one role shell + transaction review | Owner reviews desktop/tablet/mobile prototypes; contrast, labels, focus order and role hierarchy are demonstrated |
| 2 — Shared system | Consolidate buttons/forms/dialogs/tables/status/state components using the disposition inventory; role-aware shell | Existing route behavior retained; keyboard/mobile interaction and permission context verified; no accidental tenant-wide traveler content |
| 3 — Public entry and authentication | Landing/navigation/footer, login/signup/recovery, public content and preview states | Mobile entry reachable; authentic CTAs and claims; registration/routing contract tested by engineering |
| 4 — Traveler and transaction | Approved personal overview, discovery, listing details, supported booking/review/result flow | Prices and binding action match contracts; success, pending, retry, expired and unavailable states verified |
| 5 — Role operations | Operator, Hotel, Transport, Visa Agency, Finance; management tables, filters, forms | Real role data and high-frequency workflows validated; task priorities survive mobile transformation |
| 6 — Governance and remaining surfaces | Distinct Super Admin tenant/governance review, social/messages/profile/settings, remaining public pages | Scope and consequence of sensitive actions are clear; valid content retained; regressions resolved |

This order is a dependency plan, not a release schedule or estimate. Backend/auth/payment corrections belong to explicitly authorized engineering work, coordinated with this UI plan. Design specifications do not authorize those changes.

## Retain, refine, consolidate and propose

Retain the logo and identity assets, recognized palette, Manrope/Inter/Arabic font provisioning, Lucide outline icon convention, useful route/domain organization, published guide structure and genuine product content. Refine shell hierarchy, tables, forms, charts and truthful feedback. Consolidate repeated inline controls and conflicting input styles according to `08_COMPONENT_SYSTEM_PROPOSAL.md`; do not replace everything indiscriminately.

A dedicated Traveler Dashboard, unified consumer review/payment/completion journey and role-specific mobile shell are **PROPOSED / NOT CURRENTLY IMPLEMENTED**. Queue indicators, bulk actions, itinerary completeness and availability matrices require actual data/permission support. Preserve existing implemented fragments until the owner and engineering establish their migration behavior.

Avoid an all-at-once theme sweep. Move one representative domain through the chosen system, review it, then migrate repeated patterns. Keep public hospitality density separate from operational table density within the same semantic foundations.

## Future validation requirements

Validate the selected implementation at 320, 360 and 390px mobile, 768px tablet and 1280/1440px desktop, plus long labels and 200% text zoom. No fixed desktop sidebar consuming mobile content. Transform tables into labeled records or explicitly scrollable essential tables; preserve identifiers/status/actions. Check menu/dialog Escape, focus trapping/return, labels, errors, keyboard-only use, reduced motion, status beyond color and WCAG 2.2 AA contrast targets. Test target-language RTL with real content if approved.

Use distinct fixtures for loading, loaded empty, populated, failure, stale data, no permission and unavailable capability. Test each real role and tenant boundary, not the local visual persona switch. Validate transaction prices, pending-submission protection, durable result status and retry without duplicate submission. Verify content and integration claims against actual capabilities before release.

Automated and manual checks should follow the selected implementation's actual risk. This discovery phase requires document/evidence review; it does not require running a production mutation, payment or registration to demonstrate a design issue. Deployment, merge and production verification are outside this loop.

## Implementation boundary

No implementation tasks were started. No commit or deployment was made. Owner selection remains open. The next authorized action is visual generation and product-owner review, not frontend refactoring.
