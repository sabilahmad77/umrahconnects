# Component System Proposal — Documentation Only

Date: 17 September 2026. This is a future architecture and migration proposal, not permission to implement. Repository findings are source-confirmed; rendered behavior and access limits are recorded separately in `01_CURRENT_UI_AUDIT.md`. Exact colors and current foundation definitions are in [Current Design DNA](02_DESIGN_DNA.md).

## Current inventory

67 TSX files exist in `apps/web/components`, spanning domain screens, shell, providers and one shared UI confirmation dialog. A screen component is not automatically a reusable primitive. Package dependencies alone are not proof of deployed component behavior.

| Requested family | Source-confirmed implementation | Variants / weakness | Disposition |
|---|---|---|---|
| Buttons | Inline native HTML throughout; [booking actions](/Users/macbook/Projects/umrah-connects/apps/web/components/bookings/booking-list.tsx:92) | Filled green, border, ghost, danger, icon-only; rounded-lg/xl, independent padding and colored shadows | Consolidate recipes; retain intent and action handlers |
| Inputs | [Transport inputCls](/Users/macbook/Projects/umrah-connects/apps/web/components/transport/transport-tabs.tsx:391), [InquiryForm](/Users/macbook/Projects/umrah-connects/apps/web/components/public/inquiry-form.tsx:76) | Local constants, utility strings and globally injected `.input`; disparate borders/focus | Replace duplicated styling with Field/Input contract |
| Textareas | InquiryForm, profile, pilgrim and visa forms | Resize-none is common; labels/error associations differ | Retain native element; standardize label/hint/error |
| Selects | Native `<select>` in transport, hotel, pilgrim, visa forms | Different density/border/radius; dependency on Radix select does not establish a custom select | Prefer native where sufficient; optional accessible enhanced select only when justified |
| Checkboxes | No common primitive found in web UI directory | No shared indeterminate/bulk-selection contract evidenced | Proposed primitive; do not invent existing shared support |
| Switches | [Settings notification rows](/Users/macbook/Projects/umrah-connects/apps/web/app/(dashboard)/settings/page.tsx:136) | Visual div switches from hardcoded enabled booleans; no switch role/state/control handler | Replace presentation after product persistence contract is defined |
| Tabs | [Transport tabs](/Users/macbook/Projects/umrah-connects/apps/web/components/transport/transport-tabs.tsx:106), [Visa inbox tabs](/Users/macbook/Projects/umrah-connects/apps/web/components/compliance/visa-requests-tabs.tsx:19) | Segment container versus pills; visa has role/selected but no panel linkage/arrow navigation | Consolidate behavioral primitive; keep role-specific labels |
| Cards | Repeated white rounded-2xl gray100 shells; [Booking StatCard](/Users/macbook/Projects/umrah-connects/apps/web/components/bookings/booking-list.tsx:26) | Static/content/action/KPI/photo cards treated as separate recipes | Define surface and interactive-card variants |
| Modals / dialogs | [ConfirmDialog](/Users/macbook/Projects/umrah-connects/apps/web/components/ui/confirm-dialog.tsx:26), [Transport ModalShell](/Users/macbook/Projects/umrah-connects/apps/web/components/transport/transport-tabs.tsx:393), [hotel modal](/Users/macbook/Projects/umrah-connects/apps/web/components/hotels/hotel-detail.tsx:203) | Repeated fixed overlays; role/label inconsistent; no focus-trap/Escape/restore implementation in inspected shells | Consolidate overlay behavior; retain ConfirmSpec business rules |
| Drawers | No reusable drawer implementation/import found; vaul package is present | Current center modals do not prove drawer capability | Proposed responsive overlay variant |
| Tables | [Booking table](/Users/macbook/Projects/umrah-connects/apps/web/components/bookings/booking-list.tsx:170), hotel, pilgrim, visa/admin lists | Native tables with per-screen header/cell styles; booking hides amount/date columns and clickable row has no keyboard handler | Shared table structure with actual links and deliberate mobile field priorities |
| Badges / status indicators | Local STATUS records; [booking statuses](/Users/macbook/Projects/umrah-connects/apps/web/components/bookings/booking-list.tsx:16), visa metadata imported from lib | Label + dot often good; stock status colors and varying 10/11/12px size | Shared semantic badge; domain states remain separate |
| Navigation / sidebar | [Role sidebar](/Users/macbook/Projects/umrah-connects/apps/web/components/layout/sidebar.tsx:252), [public chrome](/Users/macbook/Projects/umrah-connects/apps/web/components/public/public-chrome.tsx:12) | Role sections and active stripe worth retaining; icon-only collapsed labels rely on title; tiny group headings | Refine two purposeful public/app patterns |
| Headers | [Header](/Users/macbook/Projects/umrah-connects/apps/web/components/layout/header.tsx:33) plus local page header patterns | Fixed w72 search, ⌘K hint with no handler, help button without name/handler; local action placement differs | Retain shell division; give controls valid actions and responsive contracts |
| Breadcrumbs | No shared Breadcrumb found in component/app scan | Detail back links exist; no reusable hierarchical trail evidenced | Proposed composite for true hierarchy, not every page |
| Pagination | [Booking Prev/Next](/Users/macbook/Projects/umrah-connects/apps/web/components/bookings/booking-list.tsx:243), hotels/pilgrims | Inline controls, varying count/page feedback | Consolidate; retain existing server paging |
| Forms | InquiryForm plus inline domain add/edit forms | Many sibling labels without htmlFor/id; custom submit buttons without `<form>` semantics | Shared FormSection/Field; retain schema/API behavior |
| Charts | Recharts in [reports](/Users/macbook/Projects/umrah-connects/apps/web/components/reports/reports-view.tsx:132) and [OperationsPulse](/Users/macbook/Projects/umrah-connects/apps/web/components/dashboard/operations-pulse.tsx:263) | Area/bar/pie; custom hardcoded colors, small axes; no shared accessible chart contract | Retain chart library and valid data; add common presentation + text/table alternative |
| Empty states | [No bookings](/Users/macbook/Projects/umrah-connects/apps/web/components/bookings/booking-list.tsx:182), [document checklist](/Users/macbook/Projects/umrah-connects/apps/web/components/compliance/visa-document-panel.tsx:134) | Some helpful process text, many bare no-record messages; empty/filtered-empty not consistently distinguished | Shared purpose-specific feedback states |
| Loading states | Inline pulse placeholders and Loader2 spinners; native Skeleton exists | App preserves some card geometry; no common busy/live-region policy | Reuse geometry; standardize Skeleton/LoadingState |
| Errors / alerts | [Booking error with retry](/Users/macbook/Projects/umrah-connects/apps/web/components/bookings/booking-list.tsx:162), inquiry inline error, settings warning | Retry exists in some views; some mutation errors only toast | Common inline recovery contract |
| Toasts / notifications | Sonner root Toaster; [NotificationBell](/Users/macbook/Projects/umrah-connects/apps/web/components/layout/notification-bell.tsx:25) | Real unread/read workflow worth retaining; independent popup positioning, emoji type visuals | Retain Sonner and hooks; standardize message severity and notification panel |
| Date pickers | Native date inputs in [pilgrim form](/Users/macbook/Projects/umrah-connects/apps/web/components/pilgrims/pilgrim-list.tsx:433), hotel/visa/profile forms | No shared custom calendar found | Retain native dates; add explicit range/time-zone/error wording |
| File upload UI | [Visa document input and upload action](/Users/macbook/Projects/umrah-connects/apps/web/components/compliance/visa-document-panel.tsx:180) | Useful accepted-type list and disabled busy state; upload/replace/version/rejection workflow present | Retain workflow; add size/progress/failure/retry contract |
| Avatar / tooltip | Header initials, profile photo; icon title attributes | Multiple shapes; no shared interactive tooltip imports found | Shared avatar sizes; tooltip must be additive, never sole accessible name |

Native inventory: [UI.tsx](/Users/macbook/Projects/umrah-connects/apps/mobile/components/UI.tsx:5) exports Card, KpiCard, Skeleton, StatusBadge, Button, ScreenTitle, SectionTitle, EmptyState and Mono. [brand.tsx](/Users/macbook/Projects/umrah-connects/apps/mobile/components/brand.tsx:24) exports GreenHeader, SegmentedTabs, ChipTabs, MediaPanel, CategoryTile, PrimaryButton, GhostButton, PriceRow and SectionHeader. Preserve this investment; reconcile overlapping buttons/headings through documented contracts rather than copying native code into the web DOM.

## Proposed architecture

Keep domain logic in booking/hotel/transport/visa/admin modules. Foundation and generic component layers own presentation and accessibility contracts; they must not own role permissions, API decisions, or business status transitions. Shared shells compose different navigation and workflows per confirmed role.

| Layer | Proposed ownership | Boundary |
|---|---|---|
| Foundations | Named brand palettes → semantic role mapping, type/spacing/radius/elevation/motion/breakpoints | Identity consistent across directions; direction supplies permitted density and composition presets |
| Primitives | Button, IconButton, Link, Input, Textarea, Select, Checkbox, Switch, Badge, Avatar, Tooltip, Tabs, Skeleton | No API/domain logic; keyboard and state contracts explicit |
| Composites | Card, DataTable, FilterBar, PageHeader, Breadcrumbs, Pagination, StatsModule, FormSection, Modal, Drawer, Alert, NotificationPanel, UploadField, DateRangeField, ChartFrame | Combine primitives; accept data/status/recovery content |
| Application patterns | DashboardShell, BookingFlow, ProfilePage, CRUDManagement, MarketplaceListing, AdminManagement | Domain modules select content and permissions; patterns provide layout/workflow grammar |

### Foundations (proposed values; not current implementation)

| Foundation | Shared baseline | Direction adaptation |
|---|---|---|
| Color | Preserve exact green/gold/emerald/navy/ivory/sandstone. `action.primary` green/white; gold uses deep-green text. Semantic success/warning/error/info distinct from brand | A warm/photographic; B predominantly neutral work canvas; C ivory consumer canvas with precise navy admin treatment |
| Typography | Keep existing families. UI 14–16, helper 12–14, subsection 18–20, page 24–32; monetary/table values use tabular numerals | A editorial landing 44–56; B controlled landing 40–48 and dense metadata 13; C landing 48–56 with same operational scale |
| Spacing | 4/8/12/16/20/24/32/40/48/64; 16px mobile gutter, 24px tablet, 24–32px desktop | A generous 24–32 section rhythm; B compact 12–20 work modules; C 24 consumer/16–24 operations |
| Radius | Control 8–10, compact surface 10, content card 12–16, overlay 16; full only avatar/pill. Choose one approved map after direction selection | A 16 content cards, B 10–12 operations, C 12–16 by purpose; do not vary arbitrarily within a purpose |
| Elevation | Level0 border/no shadow; level1 subtle active/raised surface; level2 overlay. Avoid permanent colored button shadows | Photography may provide depth in A; B tables remain flat; C tightly controlled sectional separation |
| Breakpoints | Use current inherited 640/768/1024/1280/1536 thresholds as baseline. Shell transformation responds to usable content width | Dashboard mobile overlay nav below 768; tablet icon rail only if primary task remains usable; desktop full role nav |
| Motion | State transitions 120–180ms, overlays 180–220ms, no background loops. Reduced-motion disables nonessential transforms/pulse | Identical accessibility behavior across directions; no direction needs animated decoration |

The typography ranges are deliberate proposals, not a mandate to enlarge every metric or hero. Exact line heights, script fallback and content wrapping require selected-direction visual validation. Shared semantic token names should remain stable if density changes.

### Primitive specification contracts

| Primitive | Variants and states | Accessibility / behavior |
|---|---|---|
| Button / IconButton | Primary, secondary outline, ghost, destructive; compact 36px desktop, standard 44px; default/hover/focus/pressed/disabled/busy | Native button semantics; explicit type; visible name or aria-label; loading preserves label and width; prevent duplicate submissions; mobile target 44px is a design target |
| Input / Textarea | Standard and compact; normal/read-only/disabled/error; prefix/suffix optional | Field label associated with id; help/error describedby; invalid state; text entry preserved on errors; meaningful autocomplete/input mode |
| Select | Native single-select first; enhanced search only for large option sets | Label/id; keyboard operation; selected value and empty placeholder clear; no invented option list |
| Checkbox / Switch | Checked/unchecked/indeterminate for checkbox, on/off for switch; busy/disabled | Real interactive control; label/state exposed; use checkbox for selection and switch for immediately applied preferences; persistence errors revert/clarify |
| Badge | Neutral/info/success/warning/danger/brand; compact/standard | Text always conveys state; dot/icon supplementary; do not make all successful states brand green without context |
| Avatar | 24/32/40/64, person/organization, photo/initials fallback | Appropriate alternative/name; decorative initials hidden if name already adjacent |
| Tooltip | Short supporting explanation | Keyboard focus as well as hover; dismissible; no essential text only inside tooltip |
| Tabs | Underline for peer content, segmented for compact views; selected/disabled | Arrow navigation, roving focus, selected state and panel linkage; use navigation links when changing routes |

### Composite contracts

| Composite | Required anatomy | State and responsive contract |
|---|---|---|
| Card | Optional header/body/footer; defined static versus linked behavior | Avoid clickable container with nested competing actions; actual title link remains keyboard reachable |
| DataTable | Caption or named region, column headers, stable row identifier, cell/action structure | Sorting/filtering/paging explicit; loading/error/no data/no matches distinct; prioritize necessary fields, not arbitrary hiding |
| FilterBar | Search label, filters, active filter summary, result count, clear | Mobile filter drawer with Apply/Clear; search and primary action remain visible; URL persistence where appropriate |
| PageHeader | Title, brief context, optional breadcrumb, one primary action, secondary actions | Stack on mobile; long titles wrap; critical action appears before supplementary details |
| StatsModule | Label, value, unit, scope/time period, optional truthful comparison | No fake trend arrows; missing data shown unavailable; loading retains layout; KPI count respects role needs |
| FormSection | Heading, description, fields, validation summary, primary/cancel | Single-column mobile; preserve input on failure; submit Enter from real form; async failure actionable |
| Modal / Drawer | Labelled title, description, close/cancel, body, actions | Initial focus, focus containment, Escape, return focus, inert background; scroll body without hiding actions; long/mobile task uses full-width sheet or page |
| Notification / Alert | Severity, message, optional timestamp/action/dismiss | Persistent inline error for task blockers; toast for transient confirmations; status announcements; panel fits viewport |
| Pagination | Current range/total where known, previous/next, page state | Preserve filters; announce results; clear disabled controls; mobile retains range plus controls |
| ChartFrame | Title, scope/time period, plot, legend, text summary/data alternative | Stable category colors; currency/date units; responsive labels; no hover-only essential values |
| UploadField | Required document/type, formats/size limit, file selection, progress, state, replace/retry | Keep existing visa version/rejection semantics; disclose verified limits from backend; keyboard and screen-reader naming |

Modal behavior recommendations follow [W3C dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Existing `role="dialog"` and `aria-modal` attributes alone do not implement focus containment, background inertness, or Escape handling.

### Application pattern contracts

| Pattern | Retain/refine | Purpose-specific distinction |
|---|---|---|
| Dashboard shell | Role nav configuration, green sidebar, brandmark, notification hooks, domain canvases | Traveler centers journey/discovery; Operator centers own groups/bookings/pilgrims; Hotel centers reservations/rooms; Transport centers fleet/assignments; Visa centers tickets/documents; Finance centers monetary work |
| Booking / transaction flow | Existing quote/request/offer/booking distinctions and actual price data | Dates/party/service → review → explicit commitment → confirmation, mapped only onto supported endpoints. Label inquiry versus booking versus payment honestly |
| Profile page | Existing photo/initials/privacy/travel preferences | Separate identity, visibility and journey preferences; never promise persistence that is absent |
| CRUD management | Existing filters/page state/add/edit/detail patterns | Table + accessible create/edit overlay or page; success updates data; deletion states exact consequences |
| Marketplace / listing | ListingVisual actual-photo/fallback pattern, service categories, supplier and price content | Consumer scan/compare versus partner publishing; expose verified identity/status only when actual data supports it |
| Admin management | Existing admin-specific views, ConfirmSpec reason/type-to-confirm mechanics | Distinct platform-admin navigation, tenant context, privileged-action consequence and audit trail; no Operator platform-governance controls |

## Retain, consolidate, replace

**Retain and refine:** logo assets/fonts/palettes; role sidebar configuration and active indicator; real NotificationBell polling/read workflow; Sonner; Recharts and valid queried data; ListingVisual fallback logic; useful domain statuses and form workflows; ConfirmSpec typed confirmation/reason collection; native UI/brand components after overlap review.

**Consolidate:** inline button recipes and icon actions; page headers; card/KPI modules; local status pills; inputCls and repeated global `.input` styles; tabs; table/pagination/filter structures; error/empty/loading patterns; modal shells and chart frames.

**Replace behavior before polishing:** presentation-only settings switches; nonfunctional search/help/keyboard-shortcut affordances; inaccessible modal interaction shells; clickable table rows without keyboard equivalent; unrelated legacy orange focus styling. Preserve underlying domain content and handlers that work. Replacement decisions apply only after implementation authorization.

## Accessibility and honest-state gate

Normal text should reach 4.5:1; large text 3:1 [WCAG reference](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Token math and limitations are in Design DNA. A passing token pair does not certify a screen: overlays, opacity, imagery, input boundaries, focus and actual text sizes must be checked separately.

Required review states for every interactive component: default, hover, keyboard focus, active/selected, disabled, pending, success, failure. Data components additionally cover no records, no filter matches, stale/unavailable data and partial success. Include keyboard traversal, screen-reader names, zoom/reflow, narrow screens, and reduced-motion behavior. Avoid generating snapshots or tests that merely repeat CSS classes; future checks should validate user outcomes.

Source-confirmed examples requiring follow-up: InquiryForm sibling labels at [line68](/Users/macbook/Projects/umrah-connects/apps/web/components/public/inquiry-form.tsx:68); header unnamed search/help at [line38](/Users/macbook/Projects/umrah-connects/apps/web/components/layout/header.tsx:38); unlabelled transport dialog and close button at [line395](/Users/macbook/Projects/umrah-connects/apps/web/components/transport/transport-tabs.tsx:395); visa tabs without keyboard/panel linkage at [line19](/Users/macbook/Projects/umrah-connects/apps/web/components/compliance/visa-requests-tabs.tsx:19). These are evidence of missing source provisions, with actual rendered impact to be validated in the runtime audit.

## Later migration order — not authorization

1. Product owner selects A/B/C after visual concepts. Freeze identity anchors and approved density recipes.
2. Inventory actual reachable screen states and working action/persistence contracts with the engineering session.
3. Establish semantic foundations and accessible primitives; demonstrate authentication plus one form/table/overlay example.
4. Replace repeated composites one representative domain at a time; keep business status semantics and permissions intact.
5. Extend shell/role adapters, marketplace/booking patterns, and deliberately distinct admin patterns.
6. Validate representative desktop/tablet/mobile workflows and keyboard/error states; approve rollout separately.

No CSS, Tailwind configuration, token, production component, API, backend, authentication, database or infrastructure change is included in this discovery loop.
