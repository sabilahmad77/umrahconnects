# Direction B — Modern Platform / Operations

**Status: DESIGN SPECIFICATION ONLY. No source implementation authorized.**

This direction makes Umrah Connect a clear, polished operations workspace. It prioritizes role-specific queues, readable tables and predictable actions. Public discovery remains welcoming but uses product structure as the main visual expression. It preserves the existing green/gold identity and logo; it does not turn Operators into Super Admins.

Evidence: existing role navigation in `apps/web/components/layout/sidebar.tsx`; Operations Pulse, Hotel, Transport, Visa and Admin dashboard components; read-only route inventory. Research principles and limitations: [12_DESIGN_RESEARCH.md](./12_DESIGN_RESEARCH.md). These proposals do not establish runtime availability, provider permissions, API readiness or product approval of new workflows.

## The 24 specification dimensions

| # | Dimension | Direction B specification |
|---|---|---|
| 1 | Design philosophy | Make the next operational decision clear. Use role-specific task queues before secondary summaries. One shared component language; different information architecture for different work. |
| 2 | Visual character | Flat, precise, restrained, light. Strong alignment, compact modules, clear dividers and generous canvas width for data. No decorative dashboard collage. |
| 3 | Typography | Inter for navigation, controls, tables and body; Manrope for page/section headings. Proposed sizes: body/table 14px, helper 12–13px, section 18–20px, page 28px, desktop hero 48–56px. Line-height 1.4–1.6; tabular numerals for comparable numeric columns. Font/language coverage must be validated; Arabic uses a suitable supported font, not forced Latin styling. |
| 4 | Brand colors | Preserve deep green `#0F3D37` for primary actions and identity, gold `#C8A96B` for restrained brand accents, existing logo intact. Green tint marks selection; gold never becomes unreadable small text on white. Semantic colors retain explicit labels. |
| 5 | Neutral/background system | Proposed cool-neutral canvas `#F5F7F8`, white `#FFFFFF` surfaces, text `#17252B`, secondary `#52616B`, borders `#DCE3E7`. These are direction proposals, not changes to existing tokens. Contrast validation remains required. |
| 6 | Header/navigation | Public header: brand, current high-value destinations, Sign in and one primary CTA. App topbar: tenant/role context, permitted search, notifications and account. Separate platform-governance scope for Admin. Never imply cross-tenant search for Operators. |
| 7 | Hero composition | A 12-column structure: short value statement and CTAs at left, one flat annotated product preview at right. Retain valid existing hero title/description. Preview is explicitly labeled illustrative and contains no invented growth or platform-health claim. |
| 8 | Cards | 8px radius, 1px border, 16–20px internal padding. KPI modules are shallow and consistent; display period/source if applicable. Avoid large icon tiles and repeated secondary mini-cards. Entire-card interaction only when its destination is unambiguous. |
| 9 | Buttons | 8px radius. Primary deep-green/white; secondary white/green border; quiet text action for low priority. Default 40px height on desktop; touch actions at least 44px. One clear page-level primary action; destructive styling distinct and reviewed when required. |
| 10 | Forms | Persistent labels, required/optional clarity, inline help and errors. Related fields in titled sections; logical tab order. Form width follows content rather than canvas width. Draft/save/review actions only where supported. Preserve entered values on recoverable errors. |
| 11 | Tables | Toolbar includes scoped search, filters, clear/reset and primary list action. 44–48px proposed desktop rows, 14px type, aligned numeric columns, text statuses. Sorting/pagination explicit. Selection appears only for valid bulk workflows; reveal eligible actions and selected count. Details use a page or panel. |
| 12 | Dashboard shell | Desktop sidebar 240px, topbar 64px, content margins 24px; fluid primary canvas. Heading plus description and contextual actions precede compact KPIs, attention queue and wider task list. Sticky elements must not obscure content/focus. |
| 13 | Sidebar | White surface with brand masthead, visible workspace/role, grouped links and tinted active item with a non-color marker. Operator groups use CRM/inventory/finance; Admin uses platform control/governance/config. Consolidate duplicate links where they lead to the same task; permissions remain enforced independently. |
| 14 | Data visualization | Use charts only for a real question with available data, period, units and textual/table alternative. Bar/time-series suited to comparison; no decorative donuts. Primary green, gold secondary with readable labeling; no fabricated trends. Missing data has an explicit unavailable state. |
| 15 | Iconography | Retain consistent Lucide-style outline icons at 16–20px. Icons support labels; icon-only controls require accessible names and tooltips. No random religious glyphs or decorative AI sparkle. |
| 16 | Photography/imagery | Relevant Makkah/Madinah/hospitality photos may support public discovery, with rights and respectful framing. Authenticated operations primarily use information, not photography. No borrowed supplier photos, logos or official emblems. |
| 17 | Empty states | Distinguish genuinely empty, no search results, permission limits and unavailable data. Explain the condition and a legitimate next action. Small icon optional; no giant illustration. Unavailable values use `—` with context, never silently zero. |
| 18 | Loading states | Preserve intended layout using modest skeleton rows/KPIs; meaningful loading text for assistive technology. Keep already-loaded regions usable. No endless shimmer or status claim while fetching. Reduced-motion renders static placeholders. |
| 19 | Error states | Inline module errors where partial content remains useful, with Retry and clear scope. Forms preserve input. Authentication/permission problems explain a real recovery path. Payment failure must not imply confirmed fulfillment or completed booking. |
| 20 | Mobile behavior | Task-first single column; compact KPIs, priority queue, labeled record list and detail view. Navigation drawer with role identity. Filters in a full-height sheet, complex edit/review as full-screen pages. Avoid squeezing wide tables and hover-dependent actions. |
| 21 | Motion | Proposed 120–180ms subtle color/opacity transitions for feedback. No parallax, animated data counters, pulsing operational health or floating surfaces. Honor reduced-motion preferences; loading does not rely on animation alone. |
| 22 | Accessibility | Target WCAG 2.2 AA through later validation: text contrast 4.5:1, large text 3:1, meaningful controls/focus 3:1, keyboard access, visible focus, semantic tables, labeled forms and dialogs. Touch targets planned at 44px; support zoom/reflow and RTL logical alignment. Color is never the only state cue. |
| 23 | Fit for Umrah Connect | Existing bookings, pilgrims/groups, hotel inventory, fleet assignments, visa stages and governance surfaces all benefit from readable data and shared interaction conventions. Identity remains recognizable and religious context stays respectful. |
| 24 | Risks/tradeoffs | Lower editorial warmth and spectacle than A; greater risk of feeling like generic SaaS unless role task structure and brand details are deliberate. Table/action consolidation and mobile task design require product and engineering effort. No inference that a new layout fixes backend failures. |

## Representative screen specifications

All ten are **proposed visual refinements or concepts**, even where an existing route is identified. Existing routes establish source presence only. Add no unverified service promises, fabricated metrics, testimonial, partnership or percentage trend.

### 1. Public Landing Page — existing `/`

Retain “One platform for every Umrah journey.” and the existing ecosystem description. Header uses current destinations: Solutions, Marketplace, Resources, Pricing, About Us, Sign in and Get Started. Left hero has Get Started and Request a Demo; right hero has a single “Illustrative product preview” of role/work queues. Follow with concise role/use-case rows, marketplace discovery explanation, real workflow explanation, documented FAQs, final CTA and footer/help/policies. Retain legitimate content; unsupported trust claims and static metrics are flagged for product decision rather than reused as proof. Primary CTA maps to the actual signup route and demo to existing contact intent.

### 2. Login / Authentication — existing `/login`

Centered white form, 440px maximum width, modest brand masthead. Keep the existing supported authentication modes. Persistent labels, clear Sign in action, password recovery, Sign up link and field/form error. Optional contextual panel on wide desktop explains the platform using verified copy only. Mobile shows a simple single-column form; password controls are labeled. No auto-selecting a role, demo credentials or granting access in the concept.

### 3. Traveler Dashboard — PROPOSED / NOT CURRENTLY IMPLEMENTED as a dedicated overview

The current pilgrim navigation exposes community/discovery and journey-related routes such as My Bookings/Travel Plan; a dedicated traveler overview must not be presented as existing. Proposed heading “Your Umrah journey”; current journey/status, next required action and booked services form the first reading order. Secondary regions: Travel Plan, My Bookings, documents/support links where supported, and community. No operator fleet/revenue/tenant metrics. Empty traveler state directs to Discover or existing planning tasks. Confirm supported booking/document data before implementation.

### 4. Operator Dashboard — existing `/dashboard` Operations Pulse

Visible “Operator workspace” and tenant context. Primary navigation: Dashboard, Pilgrims & CRM, Bookings, Packages, Groups; inventory/finance subordinate groups; shared marketplace/social later. Compact metrics use actual pilgrims, confirmed bookings, groups and payment data with period/source; fabricated percentage trends and unconditional “All systems live” are removed from concept. Attention queue precedes recent booking table; show group/pilgrim, dates, status and next action. Creating/managing booking paths must use supported actions. No All Tenants, KYC governance or platform roles.

### 5. Hotel Dashboard — existing `/hotel-dashboard`

Visible “Hotel workspace” with property scope. Primary operational region shows pending requests and upcoming check-ins/check-outs; rooms/occupancy/bookings summaries are compact. Inventory and room maintenance exceptions have clear destinations. Booking table identifies guest/group, property, dates and state. Availability/price edit is a distinct form/review flow only if supported; do not imply channel syncing. On mobile, arrival/departure cards lead with date, booking identity and valid next action.

### 6. Transport Dashboard — existing `/transport-dashboard`

Visible “Transport workspace”; Vehicles & Fleet, Drivers, Routes, Assignments and Bookings. Upcoming assignments lead, with scheduled time/route, resource availability and state. Fleet counts are secondary; maintenance/unassigned exceptions use a labeled queue if supported by real data. No decorative map, live telemetry or automated routing claim. Open assignment detail for editing/review. On mobile the next assignment and contact/context dominate; conflict handling requires supported business rules.

### 7. Visa Agency Dashboard — existing `/visa-dashboard`

Visible “Visa agency workspace”; Visa Applications, Applicants, Document Management and Service Requests. Applications by stage summarize the queue without color-only coding. Main table includes applicant/group, application stage, document completeness where data exists, and next action. Prioritize missing-document/review work over revenue charts. Review and submit labels must reflect whether an action uploads, sends to an agency, or submits to an authority; do not promise approvals or invented processing deadlines.

### 8. Super Admin Dashboard — existing `/admin-dashboard`

Visible “Platform control · Super Admin” and cross-tenant scope. Primary navigation: Overview, All Tenants, All Users, Marketplace Listings; governance: KYC Verification, Website Inquiries, Roles & Permissions, System Logs, Support / Issues; configuration separate. Tenants/Users/Bookings summaries remain compact; governance queue and recent platform activity are primary. Tenant identity is a required column/context on cross-tenant records. Sensitive changes show affected tenant/resource and a review step. No “Create booking” hero or Operator inventory shortcut masquerading as governance.

### 9. Booking / Transaction Flow — existing `/bookings`, `/bookings/[id]`, traveler `/my-bookings`; unified review flow PROPOSED

Proposed sequence: service selection → party/dates → relevant details/documents → review → supported commitment action → outcome. Show cost basis, currency, taxes/fees, inclusions/exclusions and supplier identity where real data exists. Review sections have contextual Edit links and preserve input. Keep request/quote/payment/booking states separate. Do not claim immediate confirmation, refunds, guaranteed availability or a payment provider. Desktop summary uses a 320–360px secondary column; mobile exposes an expandable summary followed by clear final review/action. Returning from an error preserves the selected service and fields where feasible.

### 10. Mobile responsive example — proposed Operator booking queue, 390 × 844

Topbar: menu, existing brand, “Operator workspace”, notifications. “Bookings” heading and one supported primary list action. Search inline; Filters opens sheet with active-filter count and Clear. Record items show booking identity, group/pilgrim, dates, labeled status and explicit Open action. Secondary columns move into detail. Sticky action bars are allowed only when they preserve reading space and safe-area/focus visibility. Long lists use the supported pagination/loading model with clear progress. Never hide required facts to make the composition fit.

## Responsive behavior across the direction

Proposed design ranges: mobile below 768px, tablet 768–1199px, desktop 1200px and above. These ranges require validation against existing breakpoints before engineering; no token edits are implied.

| Pattern | Desktop | Tablet | Mobile |
|---|---|---|---|
| Navigation | 240px labeled sidebar; 64px topbar; public links visible | Collapsible drawer/rail only if labels remain accessible; public links move to menu when needed | Role-labeled navigation drawer; no icon-only hidden taxonomy; public CTA stays reachable |
| Canvas/type | 24px margins, 24px major gaps, 28px page heading; full-width operational table | 20px margins/gaps; 24–28px page heading | 16px margins, 16px major gaps; 24px page heading; body remains 14–16px |
| KPIs/cards | 4 compact columns or role-appropriate strip | 2 columns | 2 compact summaries if legible, otherwise stacked; priority task first |
| Tables | Wide table; controls/sort/pagination; side detail panel where useful | Preserve essential columns; overflow available for comparison with a clear affordance | Labeled record list and detail for tasks; deliberate horizontal table view only when comparison is the task |
| Filters | Scoped toolbar, visible active chips, Clear | Toolbar wraps without obscuring action | Full-height filter sheet; Apply/Clear; focus returned to Filters |
| Primary actions | Adjacent to page header/list toolbar | Header action wraps to new row | One visible primary action; no clusters of tiny controls; 44px touch target |
| Forms | Purposeful width; related pairs only | Pairs collapse as needed | Single column, appropriate keyboard, clear labels; no placeholder-only input |
| Dialogs/drawers | Bounded dialog for small choices; 480–560px panel for context | Drawer width proportional to available canvas | Complex flow full screen; small confirmations accessible and scrollable; background inert |
| Landing | Two-column hero and one product preview | Reduced preview; role sections in two columns | Text/CTA first; compact preview optional below; role sections stack |

## Content and state contract

- **KEEP:** logo, recognizable green/gold, valid current hero statement and supported role/service content.
- **REFINE/REORDER:** repeated quick links into meaningful navigation; summaries below urgent tasks; clear request/quote/confirmation language.
- **REMOVE FROM CONCEPT:** invented growth percentages, static demo totals and unconditional system-health badge. Existing content is documented, not edited in this loop.
- **NEEDS PRODUCT DECISION:** unsupported trust/security/compliance/support claims, offline/live-update claims, provider verification, eligibility/cancellation terms, new queues/overview and bulk actions.

Design mockups label “Design concept · No live data”. Unavailable totals use `—` plus “Data unavailable”; known empty results explicitly say “No … yet”. Never portray unknown as zero. Examples, if ever added, are visibly “Illustrative sample”; mockups must contain no passport data, real customer identity or fabricated financial trend.

## Research transfer and quality gate

Table anatomy follows general published operations guidance; trip context follows travel servicing principles; review/edit follows transactional guidance. These are inspirations, not imported visual identity. See source-specific boundaries in [12_DESIGN_RESEARCH.md](./12_DESIGN_RESEARCH.md).

Reject this direction if it relies on neon, gradients, glass, large floating cards, excessive rounding/shadow, invented numbers or generic feature imagery. Accept it for further concept evaluation only if hierarchy explains each role's next task, Admin scope is unmistakable, the existing brand survives, empty/error states are honest, and mobile tasks remain usable. No direction winner is selected here.
