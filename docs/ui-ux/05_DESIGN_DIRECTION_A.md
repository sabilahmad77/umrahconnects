# Direction A — Refined Travel Platform

17 September 2026. **DESIGN SPECIFICATION ONLY — NOT IMPLEMENTED.** One of exactly three directions; no winner selected.

The organizing idea is a calm journey from discovery to a supported reservation or request. Hospitality comes from useful location imagery, legible service details and breathing room. Operators still receive serious workspaces; Super Admin remains platform governance. The existing logo, deep green, gold and religious/travel context survive.

## 24 specification dimensions

| # | Dimension | Specification |
|---|---|---|
| 1 | Philosophy | Orient the pilgrim, explain the service, then show the next action. Reassurance comes from clear facts and recovery, rather than promotional badges. |
| 2 | Visual character | Warm, composed, editorial; generous section rhythm with disciplined grids. Real service imagery, no floating dashboard collage. Operational pages use quieter, shorter modules. |
| 3 | Typography | Retain Manrope headings, Inter UI/body, IBM Plex Sans Arabic where appropriate. Hero 56px/1.1 desktop, 44px tablet, 36px mobile; page 28/26/24px; body 16px/1.6; operational table 14px/1.45; helper 13px. No serif brand replacement. Numbers use tabular alignment. |
| 4 | Brand-color usage | Deep green #0F3D37 anchors identity and primary actions; gold #C8A96B marks thin dividers, selected editorial accents and dark-surface highlights. Emerald #2A7A6B supports noncritical highlights. Gold is not small body text on white or a white-text button. |
| 5 | Neutral/background | Existing ivory #F8F5EF canvas, white surfaces, sandstone #E8DFD1 dividers; proposed text #172B28, secondary #52605B. Alternate ivory/white sections instead of boxing every paragraph. Proposed colors require contrast verification. |
| 6 | Header/navigation | 72px public header with original logo, Solutions, Marketplace, Resources, Pricing, About Us; Log in and Get Started. Keyboard/click disclosure with visible focus. Mobile has a named Menu button, Log in inside menu, one compact CTA. No hidden destinations without replacement. |
| 7 | Hero | 12 columns, 5 text/7 destination or hospitality photo; 1200px maximum container; 64–80px vertical spacing. Retain current headline and ecosystem description. Get Started primary, Request a Demo secondary. A photo caption identifies location; an illustrative journey preview below is clearly labeled. No fictitious operating metrics. |
| 8 | Cards | Service cards use a 3:2 image, name, service facts, cost basis and explicit action. 12px radius, 20–24px padding, 1px border, no resting shadow. Dashboard cards are 16–20px padding and sized by content; avoid hotel-photo cards in every operational section. |
| 9 | Buttons | 10px radius; 44px default height, 48px primary traveler action. Green/white primary, bordered secondary, underline or quiet action. One dominant action per section. Hover color 140ms; pending keeps width, label and disabled state. |
| 10 | Forms | Labels always visible; 16px text for touch inputs, 44–48px controls, 20px field rhythm. Describe purpose and optionality. Related fields can pair on desktop; mobile stacks. Review dates, party and service before commitment. Errors preserve values and explain correction. |
| 11 | Tables | Operators use a comfortable 52px row, 14px type, light dividers, scope/period in header. Keep identity, status, date and next action visible. Numeric money right-aligned with currency. Mobile task lists expose labeled fields; comparison tables can retain local horizontal scrolling with instructions. |
| 12 | Dashboard shell | 232px green sidebar, 64px white topbar, fluid canvas with 32px desktop margins and 24px section gaps. Page header/context, urgent task, compact summaries, then work list. Traveler uses lighter journey navigation; no large sidebar on mobile. |
| 13 | Sidebar | Role and tenant/property identity first. Primary task groups at top, shared community below. 44px rows; gold small active indicator plus text/shape cue. One Groups destination, explicit Hotel/Room subsection. Admin uses navy #112234 scope band and governance groups. |
| 14 | Data visualization | In authenticated work only, show one meaningful trend or stage distribution with period/units and a textual alternative. Green primary, emerald secondary, gold accent with dark labels. No chart on traveler home merely to fill a grid. Unavailable data is not zero. |
| 15 | Iconography | Retain Lucide outlines, 20px common scale/consistent stroke; use service-specific icons. Always name icon-only controls. Do not use sacred architecture as generic error decoration. |
| 16 | Imagery | Licensed photographs of Makkah/Madinah, actual accommodation/transport where supplied and authorized; respectful human framing and accurate location. Images provide context, not implied endorsement. No generated religious scene presented as documentary evidence. No competitor imagery. |
| 17 | Empty states | Short explanation plus a supported next action: no journeys → marketplace; no search matches → clear filters; no arrivals → verified date window. Distinguish permission limits and data unavailable. Minimal line icon, no oversized illustration. |
| 18 | Loading | Skeletons match service image/text or record rows, never random sample totals. Stable title and previous results remain visible where safe; region-level loading announcement. Reduced-motion uses static placeholders. |
| 19 | Errors | Inline recovery with Retry for fetch errors, field corrections for forms, readable booking outcome. Keep the service/party/date context. A payment outcome never substitutes for supplier confirmation. |
| 20 | Mobile | Journey and next action precede imagery; drawer for navigation, full-height filters, record lists, full-screen complex forms. 16px gutters, 24px section gaps. Primary controls 44px+, safe areas preserved. No hover dependency. |
| 21 | Motion | 140–180ms color/opacity disclosure feedback. No autoplay hero, parallax, pulsing status, count-up totals or elaborate transitions. Honor reduced motion. |
| 22 | Accessibility | Target WCAG 2.2 AA: 4.5:1 normal text, 3:1 large text/control boundaries where required; visible focus and keyboard access; semantic headings/tables, dialog focus/return, labels/error relationships, 200% zoom and narrow reflow. Validate Arabic RTL with logical properties, long names and mixed numerals. |
| 23 | Fit | The product already speaks about a connected sacred journey; this direction translates that promise into service clarity without abandoning provider operations. It gives marketplace and traveler surfaces a recognizable travel character. |
| 24 | Risks/tradeoffs | Image rights, accurate supplier metadata and restrained editorial content require ownership. Comfortable density uses more vertical space for large queues; high-volume providers need a compact table mode. Photography must not delay mobile task completion. |

## Representative screens — exact proposed hierarchy

All refinements below are proposed. Source presence is not an assertion of permission or backend readiness.

| Screen | Route/status | Composition and behavior |
|---|---|---|
| Public Landing Page | `/` implemented | Header → current headline/description + relevant image + Get Started/Request a Demo → task paths for Travelers and Providers → service ecosystem → marketplace explanation → real workflow → approved help FAQs → final CTA → footer/help/policies. Replace numeric service mini-cards with role outcomes and valid links in concept only. |
| Login / Authentication | `/login`, `/signup`, `/reset-password` implemented | 440px form beside restrained image/context panel on desktop. Original logo, Sign in title, email/password, named Show password, recovery, account creation. No operator-only statistics. Single column on mobile, recovery and form errors kept near their controls. Provider interest must be explained as verification/onboarding pending. |
| Traveler Dashboard | **PROPOSED / NOT CURRENTLY IMPLEMENTED** as dedicated overview; current `/social`, `/travel-plan`, `/my-bookings` | “Your Umrah journey” → next required action → current itinerary/service summary → My Bookings/Travel Plan → support/community. One contextual destination image at most, no revenue/fleet charts. Empty overview says “No journey selected” and “Explore Marketplace”; no invented trip. |
| Operator Dashboard | `/dashboard` implemented | Operator workspace and tenant → booking/group attention queue → compact Total Pilgrims/Bookings/Groups/Outstanding summaries → upcoming group/booking list → visa and collection summaries. 2/3-width work list with 1/3 secondary panel. Readiness/attention queues need real data rules; no cross-tenant governance. |
| Hotel Dashboard | `/hotel-dashboard` implemented | Property scope → upcoming arrivals/departures and pending requests → room availability/maintenance summary → booking list → collected/outstanding. Thumbnail only in property selector, not decorative dashboard images. A future date inventory view is proposed and data-dependent. |
| Transport Dashboard | `/transport-dashboard` implemented | Today's/next supported assignments → time/route/driver/vehicle and status → unassigned/resource exceptions → available fleet and drivers → bookings. Prioritize 44px mobile detail/contact actions; no live map or GPS claim. |
| Visa Agency Dashboard | `/visa-dashboard` implemented | Application stage strip → missing-document/review work list → applicant/service request context → recent activity → secondary finance. Show reason and next step without exposing passport scans in overview. Official submission remains separate from internal status tracking. |
| Super Admin Dashboard | `/admin-dashboard` implemented | Navy “Platform control · Super Admin” scope band → governance work/KYC/listing/support queues → tenant/user summaries → cross-tenant records with Tenant column → recent audit activity. No destination photography or primary Create booking CTA. Platform permissions and Operator permissions remain separate. |
| Booking / Transaction Flow | Marketplace booking modal, request/offer conversion and booking/invoice details implemented; unified consumer flow **PROPOSED** | Service facts → dates/party → relevant details → itemized review with provider and price basis → exact supported Request/Accept/Create/Pay action → reference/state/next step. Desktop 8/4 form/summary; mobile summary expands above final review. Never turn “offer accepted” into “paid and confirmed.” |
| Mobile example | Proposed 390×844 traveler service review | Menu/logo/context → chosen service → dates/party → inclusions/provider/price basis → edit links → final supported action. 16px gutters and single column; fixed bottom action only if it clears keyboard, safe area, errors and focused content. No four-column KPI strip. |

## Responsive contract

Proposed ranges: desktop ≥1200px, tablet 768–1199px, mobile <768px. Existing breakpoints remain unchanged in this phase.

| Pattern | Desktop | Tablet | Mobile |
|---|---|---|---|
| Navigation | Public full links; app 232px labeled sidebar | Public menu; app drawer or optional labeled rail | Menu/drawer with role/scope; explicit Log in/Account, notification access |
| Cards/imagery | 3 service columns; hero 5/7 | 2 service columns; hero stacked or 6/6 only if text fits | One service column; compact image below action, never first screen entirely photographic |
| Typography/spacing | Hero 56px; page 28px; 32px app gutter | Hero 44px; page 26px; 24px gutter | Hero 36px; page 24px; 16px gutter; body 16px |
| Tables | Comfortable 52px rows; toolbar/sort/page controls | Essential columns plus clear local overflow | Labeled record list + detail; deliberate comparison mode for tabular tasks |
| Filters/actions | Visible scoped filters and primary action | Wrap toolbar while preserving action priority | Search inline, Filters sheet with Apply/Clear and active count; 44px controls |
| Forms | 640px form/320px summary; related pairs | Reduced two-column only if readable | Single column, full-screen multistep flow, retained input |
| Modal/drawer | Small dialog bounded to viewport; 480px detail panel | Wider context drawer | Small dialog scrollable; complex editing full screen, background inert, close/focus return |

## Quality gate and content boundary

Approve for visual comparison only if the next action is clearer than the photography, brand continuity is obvious, dense role workflows remain credible and mobile navigation is complete. Reject excessive glass/gradient/shadow, oversized cards, invented trust proof or decorative trends. Preserve valid copy; move or refine repeated explanation. Do not add testimonials, partners or customer totals without verified source material.

Research inspiration: destination discovery and trip context in the official Four Seasons/Emirates pages; service facts from Nusuk Umrah; review/edit from GOV.UK. These are interaction principles, not borrowed brand identity. See [research](/Users/macbook/Projects/umrah-connects/docs/ui-ux/12_DESIGN_RESEARCH.md) and [screen map](/Users/macbook/Projects/umrah-connects/docs/ui-ux/09_SCREEN_PRIORITY_MAP.md).
