# Screen priority map and direction specifications

Date: 17 September 2026. Source-backed screen existence is recorded separately from design proposals. Authenticated runtime behavior was not verified for this document; consult the current audit for actual browser evidence. All direction specifications below are proposals, not implemented UI. The three directions retain the existing logo, deep green and gold brand identity; approved token values are defined in the design-DNA and direction documents.

## Representative screen set and order

P0 means resolve trust, access, completion or basic responsive usability first; P1 means establish role workflow clarity next. These priorities apply after the product owner selects a direction, not permission to implement.

| # | Requested screen | Actual source surface | Status | Priority and reason |
|---|---|---|---|---|
| 1 | Public Landing Page | `/`, public header/footer; public preview routes | IMPLEMENTED | P0: distinguish traveler discovery from provider workspace entry; verify all claims/CTAs |
| 2 | Login / Authentication | `/login`, `/signup`, `/reset-password` | IMPLEMENTED | P0: role/onboarding and session recovery must be clear; production login excludes demo tiles by hostname |
| 3 | Traveler Dashboard | Default `/social`; `/travel-plan`, `/my-bookings`, `/requests`, `/messages` | Existing traveler surfaces IMPLEMENTED; dedicated default Traveler Dashboard **PROPOSED / NOT CURRENTLY IMPLEMENTED** | P0: own-user trip context and next steps; traveler default IA needs product decision |
| 4 | Operator Dashboard | `/dashboard` → Operations Pulse | IMPLEMENTED | P1: tenant operations and booking fulfillment; replace static growth/health assertions |
| 5 | Hotel Dashboard | `/hotel-dashboard` | IMPLEMENTED | P1: reservations, arrivals and inventory; date/property context |
| 6 | Transport Dashboard | `/transport-dashboard` | IMPLEMENTED | P1: scheduling, assignments and fleet availability |
| 7 | Visa Agency Dashboard | `/visa-dashboard` | IMPLEMENTED | P1: application review/documents before revenue summaries |
| 8 | Super Admin Dashboard | `/admin-dashboard` and `/admin-*` governance routes | IMPLEMENTED | P0: governance, platform scope, permission boundaries and review evidence |
| 9 | Booking / Transaction Flow | `/marketplace/[id]` booking modal; `/requests/[id]` offers/conversion; `/bookings/[id]`; finance/payment panels | Fragments IMPLEMENTED; unified consumer review/payment/completion journey **PROPOSED / NOT CURRENTLY IMPLEMENTED** | P0: price basis, binding action, status and recovery |
| 10 | Mobile responsive example | Existing responsive content grids; shared fixed sidebar/header shell | Responsive classes IMPLEMENTED; role-specific mobile navigation **PROPOSED / NOT CURRENTLY IMPLEMENTED** | P0: usable navigation, forms and transaction completion at narrow widths |

Finance is confirmed as a seventh dashboard type and is mapped in `03_ROLE_UX_MAP.md`. It is an additional P1 representative screen, not a replacement for any of these ten requested screens.

## Direction A — Refined Travel Platform

Calm hospitality; generous reading rhythm and editorial image use in public discovery. Operations remain functional and denser than traveler screens. Desktop public canvas uses a restrained content max-width; dashboard forms/tables occupy usable width. Warm neutral background, white surfaces, deep-green primary actions, gold for small emphasis, never approval/error status.

| Screen | Content hierarchy and composition | Interaction and responsive specification |
|---|---|---|
| Landing | Logo/navigation → existing value proposition with one contextual travel photo → traveler and provider entry CTAs → legitimate trust explanation → service ecosystem → role benefits/process → real FAQs → final CTA/footer. No invented reviews or partner logos. | Desktop split hero with readable text column; tablet smaller image below/alongside; mobile text/primary CTA before image, navigation drawer, short section rhythm. Discovery CTA must lead to an actual preview or authenticated service browse, labeled accordingly. |
| Authentication | Logo → Sign in heading and help sentence → labeled email/password → recovery → Sign in → Create account/help/privacy. Optional quiet travel image on wide screens only. | Inline persistent errors and pending state; tenant disambiguation if server requests it; preserve return destination. Signup keeps explicit role interest and provider verification explanation. Mobile single form without ornamental side panel. |
| Traveler | Proposed Journey overview built from existing travel-plan surfaces: next trip → next action → bookings/visa requests → provider conversations → community. Use itinerary cards with dates, names, status and price/currency. | Moderate card padding; no revenue KPI cards. Open details progressively. Mobile chronological itinerary, short navigation and visible next action. Failure must not look like “no visa applications.” |
| Operator | Tenant title/date context → concise counts → departures/booking work queue if supported → recent pilgrims/bookings → visa pipeline → secondary charts/inventory/finance. | Comfortable table rows with clear booking ref/date/status; inline navigation to record. Less imagery than public screens. Tablet filters wrap; mobile triage cards and record forms. |
| Hotel | Property/date context → arrivals and departures → room availability summary → reservations → revenue/inquiries. | Hospitality feel through real property thumbnail on detail, not giant dashboard photography. Inventory gets compact rows; reservation action stays beside record. Mobile arrival cards/full-screen room detail. |
| Transport | Date/dispatch context → upcoming assignment list → available fleet/drivers → bookings/status exceptions → revenue. | Plain timetable rows and generous section spacing. No live GPS map invented. Mobile trip timeline with route, passenger count, vehicle/driver and supported status action. |
| Visa | Agency/context → applications needing review → applicant/document list → status pipeline → activity → finance secondary. | Calm document reader beside applicant details on desktop; sensitive data not overexposed in overview. Mobile document preview/full-screen review, preserved input/upload state. |
| Super Admin | Clearly labeled Platform overview → KYC/moderation/support queues → ecosystem counts → activity/logs → analytics. | Distinct governance sidebar labels and explicit platform scope. Comfortable but sufficiently dense review rows; consequential action confirmation includes tenant/user and reason. No operator intake hero. |
| Booking | Proposed service selection → dates/party details → authoritative price basis and inclusions → review → supported booking/payment action → durable status/reference. | Wide readable form left, compact summary right; clear distinction between estimated price, accepted quote, booking confirmation and payment. Mobile summary before final action, one stage at a time, input preserved on retry. |
| Mobile example | 390px-wide proposed traveler Journey screen: compact logo/menu/context → next trip → next action → booking cards → visa/request section → short bottom navigation. | 16px side padding, 44px minimum controls, one-column cards, insets for sticky action/nav. Long route/provider names wrap. Drawer has close/focus control. Confirm no horizontal page scroll at 320/360/390px. |

Tradeoff: strongest traveler warmth and comfortable reading; wider spacing requires more scroll in operational views. Provide compact table treatment rather than applying marketing whitespace to dispatch or governance.

## Direction B — Modern Platform / Operations

Structured premium B2B interface; compact section hierarchy, permission-aware navigation and readable exact data. Public page explains workflows and verified product capabilities. Neutral canvas, white tables, strong deep-green shell, thin borders; limited photography. Density comes from layout and alignment, not tiny typography.

| Screen | Content hierarchy and composition | Interaction and responsive specification |
|---|---|---|
| Landing | Logo/section navigation → clear product proposition with actual product workflow illustration → traveler/provider CTAs → role-specific capabilities → request-to-fulfillment explanation → legitimate trust/security process → FAQs/footer. | Wide desktop grid with tighter section intervals; genuine product captures if deployment reviewed. Mobile diagram stacks into labeled steps; no illegible screenshot as the primary explanation. |
| Authentication | Compact centered form; email/password and recovery first; role interest only on signup. Organization selection appears only when required. | Strong labeled input/focus/error states; inline server errors separate from validation. Maintain destination and role routing. Mobile no marketing panel; no demo persona presented as a real role grant. |
| Traveler | Proposed Journey workspace: action list → booking/status summary → requests/offers → itinerary → messages/community. Use useful personal counts sparingly. | Compact list rows with expandable details; no tenant metrics. Travelers can switch between itinerary and bookings without hunting through community menus. Mobile readable summary cards preserve status/date/amount. |
| Operator | Tenant scope/date/filter → compact KPI strip → bookings/pilgrim queue → visa readiness/pipeline → small booking trend → finance/inventory secondary. | Aligned table with sticky header, search and domain filters, pagination, row details. Proposed bulk actions only if API/support/permission evidence exists. Tablet rail; mobile list transforms rather than shrinking columns. |
| Hotel | Property/date filters → availability/reservation strip → arrivals/departures table → room/allotment data → finance/inquiries. | Inventory matrix only if dated data supports it; otherwise grouped room/allotment table. Persistent property label; separate active/maintenance/booked status. Mobile date tabs/list and inventory detail drawer. |
| Transport | Date/route filters → assignment table → fleet/driver availability → trips in progress/maintenance → commercial summary. | Operationally dense rows with departure/route/resources/status; resource conflict flags require backend evidence. Mobile assignment card + focused editor; route context remains visible. |
| Visa | Review filters/status tabs → applicant queue → application status strip → selected application/document panel → recent actions → commercial summary. | Stable columns, text status, distinct document availability states. Desktop split queue/detail; tablet detail panel; mobile one application per view. No silent batch approval. |
| Super Admin | Platform scope → actionable KYC/moderation/support queues → compact ecosystem totals → audit activity → tenant analytics. | Governance navigation stays separate from Operator CRM. Review evidence and audit detail use tables; tenant identity persists across panels. Mobile urgent queue cards, complex permissions editor full-screen. |
| Booking | Proposed focused transaction workspace: stage indicator → editable details → price/terms summary → review → supported submit/payment → result. | Numeric alignment, currency/source/date explicit; guard repeated pending submissions; no fabricated instant-payment success. Mobile single-column steps with persistent summary access and full-screen filters/details. |
| Mobile example | 390px-wide proposed operator triage screen: menu/tenant/date → four compact measures in 2×2 → Today bookings list → visa/document work → primary create action. | Navigation drawer instead of fixed 244px sidebar; tap targets remain large even with dense desktop counterpart. Retain ref/status/departure fields; extra fields in detail. Filter sheet preserves selections, applied-count label. |

Tradeoff: strongest operations scalability; public/traveler experiences can feel institutional. Preserve hospitality through clear language, friendly onboarding and purposeful real travel imagery rather than weakening transactional precision.

## Direction C — Contemporary Premium Hybrid

Editorial public discovery paired with a refined role-based workspace. Subtle brand distinction through typography, warm neutral planes, a deep-green navigation band, restrained gold rules and aligned modules. No neon, glass walls, fake 3D or decorative animation. Public pages breathe; role workflows get appropriate density.

| Screen | Content hierarchy and composition | Interaction and responsive specification |
|---|---|---|
| Landing | Logo/navigation → concise two-column brand hero with real travel photo → balanced traveler/provider paths → ecosystem explanation → actual workflow/product module → trust/onboarding process → FAQs/final CTA/footer. | Strong composition without huge type/cards; imagery stays semantically relevant. Tablet hero reorganizes; mobile first screen contains clear proposition and destination CTA before decorative image. |
| Authentication | Brand mark and concise context; refined narrow form with quiet visual side panel on desktop; optional welcome/help reassurance based on valid existing copy. | One primary submit; clear route-preserving recovery. Signup distinguishes interest from active access. Mobile single form with accessible labels and password controls. |
| Traveler | Proposed Journey overview: compact trip summary/banner → personal next action → itinerary and bookings → requests/visa state → messages/community. | Small location image only when tied to actual trip/listing; status and dates always visible. Mobile journey stages and four-item navigation proposal. Do not infer readiness/eligibility from absence of errors. |
| Operator | Tenant/date header → concise KPI strip → dominant booking/work queue → visa/group readiness → restrained trend and finance modules. | Hybrid shell differs from admin by scope/navigation and emphasis. Comfortable top overview with compact tables beneath; no cross-tenant controls. Tablet drawer/rail; mobile triage and focused record actions. |
| Hotel | Property/date header with modest identity thumbnail → arrivals/departures → inventory/occupancy → reservations → financial/listing module. | Warm accommodation detail and precise availability data share typography/status system. Mobile reservation cards; property context persists; avoid image-filled inventory cells. |
| Transport | Route/date context → next assignment emphasis → dispatch table → resource availability → maintenance/finance. | A small schematic route cue may use real route endpoints; no map/tracking claim. Mobile chronological trips, resource details in sheet, one primary action per assignment. |
| Visa | Agency/context → priority review queue → status pipeline → document/application split panel → recent events → finance secondary. | Neutral document-reading plane with brand emphasis only for selection/navigation. Mobile review opens full-screen; rejection/incomplete/expired statuses remain distinct, not aesthetic color variants. |
| Super Admin | Explicit Platform control header → governance queues → global totals → activity/logs → tenant analytics. | Distinct scope band and governance grouping; more compact than operator. Review panel makes affected tenant/entity prominent. Gold is brand emphasis, never a substitute for warning/approval semantics. |
| Booking | Proposed service/quote summary → dates/party → authoritative pricing/inclusions → review → supported booking/payment → reference/status/next step. | Small meaningful service image with precision of B's transaction summary. Desktop main form plus restrained side summary; mobile stacked review and safe sticky final action. |
| Mobile example | 390px-wide proposed traveler request review: header/context → service/dates/party → provider offer details → itemized currency/price basis → terms → Accept offer → resulting status/booking next step. | Separate acceptance from payment/booking when existing workflow requires it. Long terms accessible; no fake checkout. Drawer/full-screen review retains state; bottom action avoids covering content/focus. |

Tradeoff: broadest fit across traveler and operators with stronger visual identity; requires tighter component discipline and testing to keep editorial public spacing and operational density coherent.

## Common completion and state requirements

For every screen and direction:

- Loading uses shape-matched skeletons or a concise progress indicator, retaining page identity/context. A chart cannot flash arbitrary sample data before real data arrives.
- Empty explains the verified empty state and gives the next available action. Error/unavailable/permission denied/verification pending are distinct states, with appropriate recovery. Never render a failed query as zero approved applications or no bookings.
- Status uses visible text plus optional icon/color. Dates and money have explicit locale/currency context. Time-range and freshness labels must come from valid data, not static assertions.
- Forms have persistent labels, input associations, error descriptions, keyboard focus, preserved input and disabled pending submission. Dialogs/drawers need labeled title, focus entry/return, escape/close behavior and scroll containment.
- Navigation current-page indication must not mark both Hotel and Rooms as active for the same route, or duplicate operational/shared Groups destinations. Provide a clear page title and breadcrumb for detail routes.
- Desktop tables may scroll horizontally within their own region only when unavoidable, retaining entity/status/action context; mobile uses field-labeled record cards with details. Do not hide essential cost/status columns to fit.
- Touch actions are at least 44px; layouts respect zoom, reduced motion and safe areas. Validate desktop 1440px, tablet 768/1024px, mobile 320/360/390px, and long names/content. Accessibility target is WCAG 2.2 AA; contrast values require measured validation before release.
- Proposed bulk actions, calendars, readiness measures, SLA sorting, live maps and unified checkout are not assumed API capabilities. Keep these gated by product/data evidence.

## Transaction evidence and boundary

The listing booking modal currently estimates `listing.priceCents × partySize`; it does not visibly branch its estimate by `pricingModel`, date duration or an authoritative quoted total. It collects customer identity, dates, party size and notes, then submits a marketplace booking and displays a toast. This is an implemented booking creation fragment, not an established end-to-end consumer payment checkout.

Request detail has offer acceptance/rejection and a separate convert-to-booking modal, including transport resource fields. Booking detail and finance/payment panels are separate operational surfaces. Preserve this distinction in visual concepts: show “Accepted offer,” “Booking created,” “Payment pending” or “Paid” only according to actual supported results. The unified review/payment journey in this map needs product/API specification before implementation.

## Source evidence index

- Route inventory: `apps/web/app/**/page.tsx`; route groups do not appear in browser URLs.
- Auth/role destinations: [auth provider](/Users/macbook/Projects/umrah-connects/apps/web/components/providers/auth-provider.tsx), [role inference](/Users/macbook/Projects/umrah-connects/apps/web/lib/auth.ts), [signup](/Users/macbook/Projects/umrah-connects/apps/web/app/signup/page.tsx).
- Shell/mobile constraints: [layout](/Users/macbook/Projects/umrah-connects/apps/web/app/(dashboard)/layout.tsx), [sidebar](/Users/macbook/Projects/umrah-connects/apps/web/components/layout/sidebar.tsx), [header](/Users/macbook/Projects/umrah-connects/apps/web/components/layout/header.tsx).
- Role dashboards: [operator](/Users/macbook/Projects/umrah-connects/apps/web/components/dashboard/operations-pulse.tsx), [hotel](/Users/macbook/Projects/umrah-connects/apps/web/components/hotels/hotel-dashboard.tsx), [transport](/Users/macbook/Projects/umrah-connects/apps/web/components/transport/transport-dashboard.tsx), [visa](/Users/macbook/Projects/umrah-connects/apps/web/components/compliance/visa-dashboard.tsx), [admin](/Users/macbook/Projects/umrah-connects/apps/web/components/admin/admin-dashboard.tsx), [finance](/Users/macbook/Projects/umrah-connects/apps/web/components/finance/finance-dashboard.tsx).
- Traveler aggregation: [travel plan](/Users/macbook/Projects/umrah-connects/apps/web/components/travel-plan/travel-plan-view.tsx), [my bookings](/Users/macbook/Projects/umrah-connects/apps/web/components/my-bookings/my-bookings-view.tsx).
- Transaction fragments: [listing detail/booking modal](/Users/macbook/Projects/umrah-connects/apps/web/components/marketplace/listing-detail.tsx), [request detail/offer conversion](/Users/macbook/Projects/umrah-connects/apps/web/components/requests/request-detail.tsx), [payment gateway](/Users/macbook/Projects/umrah-connects/apps/web/components/finance/payment-gateway-panel.tsx).

No direction is selected by this map. Build the representative visual concepts for A, B and C, compare their factual tradeoffs, and obtain product-owner selection before source implementation.
