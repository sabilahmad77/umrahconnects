# Direction C — Contemporary Premium Hybrid

17 September 2026. **DESIGN SPECIFICATION ONLY — NOT IMPLEMENTED.** One of exactly three directions; no winner selected.

The organizing idea is a connected journey across services, expressed through aligned information and a quiet journey index. Public discovery has a memorable editorial composition; authenticated work uses task queues and disciplined density. A thin ruled line and numbered stages describe real sequence and connection. They are not decorative circuitry, sacred symbolism or a promise of automated coordination.

## 24 specification dimensions

| # | Dimension | Specification |
|---|---|---|
| 1 | Philosophy | Make connections between journey, supplier, documents and payment understandable. Use one structural language across travel and operations, with task-appropriate density. |
| 2 | Visual character | Architectural, warm and precise: asymmetrical but aligned public composition; flat operational rows. Signature ruled journey index and a narrow scope band, never floating glass panels. |
| 3 | Typography | Keep Manrope headings, Inter body/table and IBM Plex Sans Arabic support. Desktop hero 60px/1.08, tablet 44px, mobile 36px; page 28/26/24px; body 16px; table 14px; helper 13px. Small uppercase labels only for short section metadata; no tiny paragraph copy. Tabular numerals for metrics. |
| 4 | Brand-color usage | Existing deep green #0F3D37 for core identity/actions, gold #C8A96B for one narrow journey rule or selected marker, emerald #2A7A6B for supporting data. Navy #112234 indicates Super Admin scope. Do not introduce a new fluorescent accent or role rainbow. |
| 5 | Neutral/background | Ivory #F8F5EF public canvas, white #FFFFFF work surfaces, sandstone #E8DFD1 for warm divisions; proposed ink #182D29 and secondary #52605B. Operational alternate #F4F6F3 canvas is a proposal. Distinction comes from layout rather than different brand palettes. |
| 6 | Header/navigation | Public original logo plus current destination taxonomy, one Get Started CTA and Log in. Authenticated topbar explicitly names role and tenant; contextual entity crumbs on detail. Menu/disclosure is click and keyboard operable. No global search outside the user's permitted scope. |
| 7 | Hero | 12-column composition: 6-column copy/CTAs, 5-column rectangular destination crop with 1-column whitespace; below sits a full-width 4-stage ruled journey explanation. Same current headline/description. Stages are explanatory copy, not live indicators: Discover, Request, Review, Manage. No charts or synthetic volume statistics in hero. |
| 8 | Cards | Mostly 10px radius with 1px border; 16px permitted on public media panels. 20px standard padding. Work modules align to rows; featured journey panel uses an internal two-column facts layout, not a giant raised card. Resting surfaces flat; elevation only for overlays. |
| 9 | Buttons | 10px radius; 44px default, 48px major mobile/booking action. Deep-green primary, bordered secondary, quiet text action. Gold is a brand marker, not a default action fill. Pending includes text and stable dimensions; destructive action uses explicit wording and separate semantic treatment. |
| 10 | Forms | Persistent labels; grouped short sections with optional numbered sequence. 44px controls, 16px mobile entry text. Review step has section Edit links. Validation is adjacent and announced; correct values retained. No decorative multi-step process where one form suffices. |
| 11 | Tables | 48px default rows, 14px labels, tenant/entity identity anchored first, text status, readable money/date columns. Toolbar with scoped search/filter/pagination. Context panel for details on wide screens, page on mobile. Selection and bulk actions only if valid and permitted. |
| 12 | Dashboard shell | Shared 240px sidebar, 64px topbar, 28px canvas gutters, 24px major gaps. Header/scope → role-specific attention work → compact summaries → main records → secondary analytics. Traveler journey panel and Operator queue differ in composition. |
| 13 | Sidebar | Deep-green identity zone with light body/navigation, 44px rows, clear group headings and active marker. Traveler: journey/service/community; Operator: CRM/inventory/finance; Admin: platform/governance/config with navy masthead. Collapse/drawer carries accessible labels; remove repeated same-route links. |
| 14 | Data visualization | Quiet 2px green time series or stage bars; source period and units required. Gold/emerald secondary series with direct labels and table alternative. Metric-strip proportions follow question importance; no sci-fi graphs, fake trend arrows or fabricated health indicators. |
| 15 | Iconography | One Lucide outline system 16–20px. Journey numbers refer to actual sequence; icons clarify service types. No sparkle-heavy AI identity, pseudo-official seals or religious symbols for routine UI feedback. |
| 16 | Imagery | One accurate, rights-cleared destination photograph on landing, contextual service images in discovery, no imagery in governance tables. Precise crops respect architecture and people. AI concept imagery is labeled illustrative; no documentary claim or invented hotel photo. |
| 17 | Empty states | Compact modules explaining no journey/no records/no matches distinctly. Offer an existing service-discovery or creation route only when permitted. Error, verification pending and unknown data have separate messages. `—` indicates unavailable metric with context, not empty. |
| 18 | Loading | Maintain scope/header and region dimensions, skeleton rows/text without made-up values. Announce progress; avoid full-screen replacement after initial load. Static reduced-motion version. |
| 19 | Errors | Region-specific banner/retry, field correction and explicit transaction outcome. Journey summary retains selected service context. An unavailable supplier fact is visibly unknown; never infer a confirmed trip from a completed payment alone. |
| 20 | Mobile | 16px gutters, one-column journey/queue, role-labeled drawer, filters sheet, full-screen complex details/forms. Stage index becomes a short vertical ordered list or text step indicator. Next action beats media. 44px+ targets and safe areas respected. |
| 21 | Motion | 140–200ms disclosure/feedback, focus stays predictable. Journey rule is static; no animated connecting beams, glowing indicators, parallax, autoplay or number counters. Reduced motion supported. |
| 22 | Accessibility | WCAG 2.2 AA target with measured contrast, keyboard/disclosure/dialog semantics, headings, real form labels and error relationships. Gold lines cannot be the sole state cue. 200% zoom and 320px reflow; Arabic RTL and long multilingual names tested separately. No compliance certification inferred from proposal. |
| 23 | Fit | The platform's actual booking/request, supplier, document and finance domains benefit from shared context. The composition creates recognition beyond generic SaaS without changing brand identity or merging roles. |
| 24 | Risks/tradeoffs | Requires stronger rules for public versus operational spacing, imagery and density. Journey/readiness aggregation needs product/API definitions; design alone cannot reconcile incomplete data. Highest coordination complexity of the three, though most foundations are shared. |

## Representative screen specifications

| Screen | Current/proposed status | Direction C hierarchy and behavior |
|---|---|---|
| Public Landing Page | `/` implemented | Brand header → asymmetrical current headline/image → CTAs → flat explanatory journey index → role task paths → discovery/service facts → connected workspace explanation → approved FAQs → final CTA/footer. Valid text retained. No numeric role cards or fictitious authority/partners. |
| Login / Authentication | Existing `/login`, `/signup`, `/reset-password` | Original logo and 440px form with one quiet adjacent platform-context block. Role-interest signup retains selection but explains verification pending. Recovery receives its own clear status. Named password toggle, persistent labels, focus/validation. Mobile simple form without marketing statistics. |
| Traveler Dashboard | **PROPOSED / NOT CURRENTLY IMPLEMENTED** dedicated overview; existing `/social`, `/travel-plan`, `/my-bookings` | “Your Umrah journey” → current journey summary + next action → service list with booked/requested state → itinerary/booking links → support/community. Quiet stage index appears only for actual known statuses. Unknown journey uses empty state, not a fake trip. No revenue, fleet or all-tenant metrics. |
| Operator Dashboard | Existing `/dashboard` | Tenant/Operator context → “Needs attention” worklist (data/rules pending) → compact pilgrims/bookings/groups/outstanding → upcoming groups and booking table → visa stages → collection summary. Booking detail unifies context links while preserving separate domain statuses. No platform roles/KYC management. |
| Hotel Dashboard | Existing `/hotel-dashboard` | Property context → arrivals/departures list → requests requiring response → room/occupancy/maintenance summary → hotel booking rows → secondary finance. Separate property/room taxonomy, availability date basis and explicit next action. No invented RevPAR or channel integration. |
| Transport Dashboard | Existing `/transport-dashboard` | Next assignments organized by time → unassigned/resource exceptions → vehicle/driver availability → route/booking records. Status text paired with subtle marker. Mobile one assignment at a time with pickup/route/resource facts; no live telemetry. |
| Visa Agency Dashboard | Existing `/visa-dashboard` | Stage summary → document/review queue → applicant context and service requests → activity. Stage index names existing lifecycle but does not imply regulator integration. Approval-rate denominator and period explicitly defined before presentation. No passport images in dashboard. |
| Super Admin Dashboard | Existing `/admin-dashboard` | Navy “Platform control · Super Admin” masthead → governance attention list → tenant/user/listing/KYC summaries → cross-tenant records with explicit Tenant column → audit activity. Tenant context remains visible in details and before sensitive changes. Distinct navigation and action vocabulary from Operator. |
| Booking / Transaction Flow | Implemented fragments; unified consumer review/checkout **PROPOSED** | Service/offer → dates/party → required data → itemized review → exact supported action → outcome and next step. Ruled step indicator with text, not ornamental dots. 8/4 form/summary desktop; mobile section review and expanded itemized cost before action. Requests, accepted offers, created bookings and payments remain distinct. |
| Mobile example | Proposed 390×844 Operator booking queue | Menu/role/scope → “Bookings” title and primary action → scoped Search/Filters → identity/date/status/amount record list → Open detail. Summary is expandable. No squeezed desktop sidebar or six-KPI grid. Drawer focus/return and clear applied-filter state. |

## Desktop, tablet, mobile

Proposed mobile <768px, tablet 768–1199px, desktop ≥1200px. No current breakpoint/token changes.

| Pattern | Desktop | Tablet | Mobile |
|---|---|---|---|
| Navigation | Public full taxonomy; 240px app sidebar | Public menu; app drawer, optional labeled rail | Role/scope drawer; one accessible menu; account and help remain available |
| Hero/journey | Asymmetrical 6/5 columns; horizontal explanatory index | Copy/media stacked or paired when fit; shortened index | Copy/actions first; one small image lower; vertical stage labels |
| Cards/KPIs | 3 discovery columns; 4 compact work summaries | 2 columns; primary queue spans canvas | Discovery single column; 2 KPIs only if legible, otherwise stacked |
| Type/gutters | 60px hero/28px page; 28px work gutter | 44px hero/26px page; 20px gutter | 36px hero/24px page; 16px gutter; body 16px |
| Tables | 48px rows, column labels, scoped toolbar | Essential columns plus local comparison overflow | Task records/details; explicit comparison mode where needed |
| Filters/actions | Inline search/filter, visible chips/Clear | Wrap without moving primary action unpredictably | Search and Filters button; full-height Apply/Clear sheet; accessible count |
| Forms/summary | 640px form plus 320px summary | Summary may stack above review | Single column; itemized review; full-screen complex task |
| Dialog/drawer | Small dialog; bounded context panel | Proportional panel | Scrollable confirmation; full-screen edit, background inert and focus restored |

## Content/state and quality gate

Retain valid product content and original logo. Refine/reorder repeated feature copy and unclear status language. Remove unsupported growth/health proof from the concepts only. Product decisions remain required for claims, data scopes, provider verification, payment capability, stage/readiness rules, new queues and a dedicated Traveler home.

Reject if the journey index becomes decoration, imagery displaces the next task, gold reduces contrast or Operator looks like governance. Reject glass, neon, oversized surfaces, fabricated data or generic AI imagery. Continue to concept comparison only when the public composition is distinctive and every operational screen still reads as a practical work surface. No winner selected.

Evidence and proposal dependencies: [brand DNA](/Users/macbook/Projects/umrah-connects/docs/ui-ux/02_DESIGN_DNA.md), [role map](/Users/macbook/Projects/umrah-connects/docs/ui-ux/03_ROLE_UX_MAP.md), [screen map](/Users/macbook/Projects/umrah-connects/docs/ui-ux/09_SCREEN_PRIORITY_MAP.md), [primary-source research](/Users/macbook/Projects/umrah-connects/docs/ui-ux/12_DESIGN_RESEARCH.md).
