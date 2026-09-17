# Umrah Connect — Current UI/UX audit

Audit date: 17 September 2026. Workspace: `/Users/macbook/Projects/umrah-connects`. Live product: [umrahconnect.io](https://umrahconnect.io/). **Read-only design discovery; no source implementation.**

## Safety and evidence contract

Initial `pwd` and `git rev-parse --show-toplevel` both returned the authoritative workspace. Remote: `https://github.com/sabilahmad77/umrahconnects.git`. Initial dirty state: modified `.claude/launch.json`; untracked `.project/`, `docs/control-tower/`, `scripts/`. These were left alone. Documentation/evidence from this track resides exclusively under `docs/ui-ux/`. No install/build/migration/seed/commit/deploy was run. Existing local web/API processes were reused; no engineering-owned process was stopped.

Evidence labels used throughout: **LIVE** = directly observed public production UI; **LOCAL** = directly observed rendered localhost UI; **SOURCE** = repository inspection; **PROPOSAL** = future design, not current behavior. Source presence does not prove production permission, API readiness or accessibility compliance. Inspection was a point-in-time sample of a workspace shared with another session.

Browser used: Codex in-app browser. Desktop views approximately 1280×720/800; verified mobile 390×844 and local tablet 768×1024. Browser viewport overrides were reset and temporary tabs closed. Screenshots and DOM snapshots are stored in [evidence](/Users/macbook/Projects/umrah-connects/docs/ui-ux/evidence). Some captures show initial fetching rather than a final empty state; files explicitly labeled `settled` and recorded later dashboard observations supersede those for data conclusions. The original reset-password capture was replaced after confirming its stable 448px card; an early narrow/transitional rendering is not a finding.

Local authentication used the existing development demo-role UI. Source shows it obtains an operator session, then changes the visible persona. Thus hotel/transport/visa/finance/admin/traveler layouts were rendered, but **real role-specific account permissions were not verified**. No production authentication was performed. No registration, booking, payment, inquiry, post, like, message, upload or configuration mutation was submitted. Login itself creates a session; demo data is not assumed isolated or write-safe despite UI wording.

## Live public route coverage

All meaningful public route families found in the current repository and visible public links were investigated. Variants are identified rather than counted as separate products.

| Public route | Actually inspected | Principal finding / evidence |
|---|---|---|
| `/` | LIVE desktop, 390px mobile, navigation, footer; SOURCE | Coherent warm green identity; competing all-role narrative, tiny dashboard illustration, numeric role cards without provenance; mobile main navigation/Log in disappear. `live-home-desktop.png`, `live-home-mobile.png` |
| `/solutions` | LIVE full-page capture/content, SOURCE | Seven role solutions are distinguishable; similar card presentation obscures different tasks. Visa approval-rate and integration-readiness language needs product evidence. |
| `/workflow` | LIVE full-page/content | Eight-stage explanation is useful, but mixes request/quote/direct booking/payment as if one available uniform path. Preserve sequence explanation, clarify branches. |
| `/pricing` | LIVE desktop, mobile capture, SOURCE | Traveler free / provider sales / enterprise custom are explicit; “MOST POPULAR” lacks cited basis. Enterprise/governance wording risks implying Super Admin is a customer plan. |
| `/about` | LIVE full-page/content | Mission fits product; connected roles/SAR can be grounded in source, “100% Audit-logged operations” is broader than this discovery proves. |
| `/marketplace-preview` | LIVE skeleton and settled empty state; `?category=hotels` variant; SOURCE | Guest boundary is clear. Hotels URL still shows All selected; source ignores category query. Failed load and real no matches both become the same empty result. Static 4.7 ratings exist in source, but populated public cards were not observed. |
| `/social-preview` | LIVE feed/sidebar/content, SOURCE | Public preview is clear about protected actions, but named providers, “Verified Provider,” engagement totals, membership counts and June/July events are static illustrative content without an explicit sample label. |
| `/signup` | LIVE role chooser and Hotel detail step; SOURCE | Six public roles, no Super Admin selector; provider follow-up notice exists. Role promise versus actual registration assignment needs engineering/product verification. No account created. |
| `/login` | LIVE desktop form, SOURCE | Production demo tiles absent, unlike local dev. Operator-only marketing framing conflicts with all-role platform. Label associations and password-toggle name missing. Unsupported market statistics remain. |
| `/reset-password` | LIVE settled missing-token state; SOURCE | Clear missing-token explanation; no visible return/re-request action. Token-valid, expired-token submission and success were not tested. |
| `/contact` | SOURCE plus LIVE generic variant view | Generic contact fields and email address shown; form accessibility and submission errors require refinement. No submission. |
| `/contact?type=demo` | LIVE form/full-page capture | Request-demo intent correctly changes title/submit label. Fields are visually labeled but exposed as unnamed controls. Sales/support variants are source-inspected; not independently submitted. |
| `/resources` | LIVE index and links | Eight resources exist; blog/guide taxonomy is useful. No search or role filtering observed. |
| `/resources/[slug]` | LIVE all eight linked articles | Articles render semantic headings/back/related links. Official-submission roadmap disclaimer is valuable. Travel/regulatory/health specifics and “exact onboarding order” need accountable content review; this audit does not certify those statements. |
| `/help` | LIVE categories, FAQ opening interaction, SOURCE | Native details disclosure opens and announces expanded state. Category cards are explanatory, not navigation to help topics. Support CTA is usable; generic Get Started/Log in ending distracts from support. |
| `/security` | LIVE claims/cards | Technical internals substitute for clear user assurance. Claims about verification, isolation and every mutation require evidence separate from visual audit. No security certification inferred. |
| `/integrations` | LIVE status cards | Available/Roadmap/Coming soon are useful distinctions, but “Visa systems Available” can imply a live connector while an article explicitly says regulator integration is roadmap. |
| `/api-docs` | LIVE coming-soon page | Honest availability notice; planned endpoint/auth/webhook descriptions must stay explicitly future, not actual partner capabilities. |
| `/careers` | LIVE no-vacancy notice/open application form | Honest no active specific roles. Reused inquiry form fits current scope; category cards/CTA hierarchy can be quieter. |
| `/partners` | LIVE categories/inquiry | Opportunity categories, not actual partner logos. Do not turn these into claimed partnerships. API integration language must match coming-soon state. |
| `/privacy`, `/terms` | LIVE full content/headings | Readable legal text and June 2026 update labels; this is a visual/content-consistency review, not a legal adequacy assessment. Claims about payments/KYC must align with product facts. |

The eight article slugs inspected: `best-times-to-visit-rawdah`, `umrah-packing-checklist`, `operators-reduce-booking-errors`, `nusuk-masar-visa-requirements`, `operator-onboarding-guide`, `hotel-listing-guide`, `fleet-management-guide`, `invoices-payments-reconciliation`. Full extracted public content is recorded in [live snapshots](/Users/macbook/Projects/umrah-connects/docs/ui-ux/evidence/live-route-snapshots.json). Unimplemented whitelist paths such as `/register`, `/forgot-password`, `/pilgrim` are not assumed actual pages. Query parameters and hash destinations were source-checked rather than exhaustively clicking every variation.

## Local architecture and rendered coverage

Next.js App Router frontend in `apps/web`, React Query data access, custom Tailwind-styled components, Recharts and Lucide. Route groups `(auth)` and `(dashboard)` are not URL segments. Nest/API and domain plugins were inspected only where needed to understand roles/onboarding; no backend changes. Mobile source theme/components were included in the system inventory, but no native app was run.

| Surface | Inspection and state | Findings |
|---|---|---|
| Operator `/dashboard` | LOCAL settled seeded operator session + SOURCE | Six tall summary cards, recent bookings/pilgrims, chart, visa pipeline, quick links, repeated revenue summary. Static +12/+8/+18%, unconditional health label and repeated chart `202` labels. Attention/actions sit below summaries. |
| Hotel `/hotel-dashboard` | LOCAL settled hotel persona desktop/mobile + SOURCE | Useful rooms/occupancy/check-ins/check-outs/finance summaries, but large blank card regions and duplicate My Hotels/Rooms destination. Mobile shell leaves ~146px before inner padding. |
| Transport `/transport-dashboard` | LOCAL settled transport persona + SOURCE | Vehicles/drivers/routes/assignments and upcoming trips present. Counts and several secondary cards precede dispatch work. No live map/telemetry observed. |
| Visa `/visa-dashboard` | LOCAL settled visa persona + SOURCE | Stage strip, applications, service requests, activity and finance. Operator overview displayed 10% approval while visa dashboard displayed 20% for same demo snapshot; denominator/period needs explicit product definition, not cosmetic correction. |
| Finance `/finance-dashboard` | LOCAL settled finance persona + SOURCE | Revenue/outstanding/commission/bookings, invoices/budget/status modules and sandbox transaction list. A payment abstraction exists, but live money capability was not tested. |
| Admin `/admin-dashboard` | LOCAL admin persona + SOURCE | Distinct Platform control/Governance taxonomy exists; cross-tenant counts/activity shown. Shared primitive styling can remain, but tenant scope, governance priorities and primary actions must differ from Operator. Demo access is not proof of proper production admin boundaries. |
| Traveler `/social`, `/travel-plan` | LOCAL pilgrim persona settled + SOURCE | Traveler shell exists, default is social. Travel plan aggregates groups/bookings/requests/visa; past demo groups appear under “upcoming” narrative and operator-scope data appears in this persona session. Dedicated traveler default dashboard is PROPOSED. |
| Bookings `/bookings`, new-booking modal | LOCAL settled table/form + SOURCE | Existing package/lead pilgrim/party/total/deposit/status/notes inputs. Create form has no review screen. Form opened and canceled only. Actual booking detail source inspected. |
| Marketplace `/marketplace`, listing detail/Book modal | LOCAL settled cards/detail/form + SOURCE | 4.6 (0) fallback rating visible. Demo hotel has per-night price, but modal estimate depends on party size rather than duration/pricing model. Customer fields use placeholders; Escape did not dismiss modal and focus stayed on launch Book button. No submission. |
| `/requests`, `/pilgrims`, `/groups`, `/finance` | LOCAL page shells and fetching screenshots; booking table later settled; SOURCE detailed flows | Navigation, filter tabs, action placement and layout observed. Immediate zero totals in loading captures are not final data findings. Request/offer acceptance/conversion, CRUD and finance forms examined in source, not executed. |
| `/settings`, `/profile`, `/messages`, `/discover`, `/my-bookings`, `/my-offers` | LOCAL representative shells/loading/empty presentation + SOURCE | Duplicate profile/settings concepts; unscoped header search; social/operational groups conflated in taxonomy. No setting saved, message sent or offer accepted. Loading captures cannot establish successful final data state. |
| Other management/detail routes | SOURCE inventory | Hotel/fleet/driver/route/assignment/visa-documents/visa-requests/admin management/support/inquiries/roles/logs and report flows inventoried; not every detail page visually opened. See role and component maps. |

Local extracted snapshots: [local records](/Users/macbook/Projects/umrah-connects/docs/ui-ux/evidence/local-route-snapshots.json). Existing `audit/screens` are historical artifacts and were not treated as fresh evidence.

## Visual and interaction assessment

**What works:** original brandmark and green/gold/ivory continuity; clear role-specific provider dashboard names; tenant context and grouped nav; guest previews separate public browsing from protected actions; real finance/visa/booking lifecycle vocabulary; loading skeletons in several data views; native FAQ disclosure; App Store/Google Play explicitly Soon; partner API explicitly coming soon.

**Hierarchy/grid:** public pages use centered headline + similar white cards, so purpose differences rely on copy rather than composition. Landing combines miniature dashboard, role totals, feature cards and mobile feature cards, with limited service-level discovery context. Provider dashboards frequently prioritize counts and large blank summaries over the task queue. Six KPI columns at desktop make long currency values wrap. Repeated quick navigation and finance totals consume space without clarifying the next decision.

**Typography/spacing:** Manrope/Inter is a sound pair; many 10–11px arbitrary labels and 6.5–8px preview text undermine reading. Spacing is mostly a useful 4px rhythm, but page/card recipes vary. Operational headers mix sizes and action placement. Radius/shadow inconsistency is maintenance and hierarchy fragmentation, not a requirement to make all elements identical.

**Responsiveness:** LIVE 390px header shows logo/Get Started only, with no replacement menu or Log in. SOURCE `hidden lg:flex` and `hidden sm:inline-flex` explain it. LOCAL 390px sidebar persists at 244px; central content clips/truncates despite document scrollWidth 390. Tablet 768px listing header compresses title to “D..” while action buttons retain width. Document overflow checks alone would miss this. See mobile/tablet evidence and direction-specific transformations.

**Accessibility:** LIVE keyboard Tab/Tab/Return focused Solutions without opening it; pointer hover/click-with-pointer previously revealed items. SOURCE only mouse-enter/leave controls disclosure. LIVE contact field names are absent from accessibility tree. LOCAL marketplace modal Escape left it open and launch-button focus remained. Source confirms missing dialog focus management in recurring modal recipes. Token contrast calculations are in DNA; no whole-site AA compliance claim. Full screen-reader, zoom, RTL and automated accessibility sweep were not run.

**Loading/empty/error:** real skeleton/loading states observed. Production marketplace eventually reported no matches. SOURCE catch converts failure to empty, so runtime observation cannot determine genuinely absent supply versus fetch failure. Newsletter SOURCE reports success in both success and catch; no newsletter submitted. Unknown/failed totals must not be conflated with zero. Known empty states should say what happened and offer an appropriate next action.

## Landing refinement and content preservation plan

Proposed IA, applied in all three directions with different compositions: navigation → current headline/ecosystem explanation → Get Started and Request a Demo → two clear task paths (traveler discovery/provider workspace) → role/service ecosystem → marketplace/service comparison explanation → honest request/quote/booking workflow → supported product explanation → approved FAQ → final task CTA → footer/help/policies. The traveler discovery entry can use existing Marketplace; new searches/filters require data/product validation. No fake social proof section.

| Category | Content treatment |
|---|---|
| KEEP | Name/logo/colors/fonts; current hero headline/description; actual roles and valid services; mission; available routes; honest guest boundaries; coming-soon mobile/API notices; legal/support links |
| REFINE | Clarify request vs quote vs booking vs payment; provider onboarding pending; internal visa organization vs official portal submission; scoped finance/verification wording; plain user assurance instead of technical security internals |
| REORDER | Workflow before mobile roadmap; role actions before numeric role cards; urgent provider work before secondary metrics; travel-plan entry nearer traveler primary nav |
| REMOVE FROM CONCEPT | Static growth/health and unsupported customer totals; default fake ratings; unlabeled illustrative community proof; decorative duplicate mini-charts; noninteractive help cards presented as task navigation. This loop does not remove source content. |
| NEEDS PRODUCT DECISION | “Trusted by thousands,” 24/7 support, secure/compliant claims, approval uplift, “MOST POPULAR,” 100% audit logging, verification gating, offline/live-flight functionality, payment readiness, governance-as-plan, email domain, content provenance and current regulatory guidance |

No claim is deemed false merely because proof was unavailable. Unsupported claims are flagged for evidence or qualification. Public preview static examples must be explicitly illustrative or replaced with authorized real content; preserve genuine content where provenance exists. Contact email uses `.app` while production uses `.io`; confirm intentional domain rather than silently rewriting.

## Linked deliverables and limitations

[DNA](/Users/macbook/Projects/umrah-connects/docs/ui-ux/02_DESIGN_DNA.md), [roles](/Users/macbook/Projects/umrah-connects/docs/ui-ux/03_ROLE_UX_MAP.md), [problem map](/Users/macbook/Projects/umrah-connects/docs/ui-ux/04_UI_PROBLEM_MAP.md), [components](/Users/macbook/Projects/umrah-connects/docs/ui-ux/08_COMPONENT_SYSTEM_PROPOSAL.md), [screens](/Users/macbook/Projects/umrah-connects/docs/ui-ux/09_SCREEN_PRIORITY_MAP.md), [research](/Users/macbook/Projects/umrah-connects/docs/ui-ux/12_DESIGN_RESEARCH.md).

No production authenticated workflows, real provider-role permission tests, complete transaction, slow-network timing, full screen-reader/RTL/zoom audit or native runtime were completed. This discovery gate is complete with those limitations disclosed; implementation/release readiness is a separate future gate.
