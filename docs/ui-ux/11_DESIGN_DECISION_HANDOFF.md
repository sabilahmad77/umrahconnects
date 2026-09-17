# Umrah Connect — design decision handoff

17 September 2026. **CODEX UI DISCOVERY GATE: COMPLETE.** Documentation and evidence only; owner selection and implementation authorization remain pending.

## Review package

| Document | Purpose |
|---|---|
| [01_CURRENT_UI_AUDIT.md](01_CURRENT_UI_AUDIT.md) | Actual live/local route coverage, screenshot evidence, limitations, landing IA and content preservation |
| [02_DESIGN_DNA.md](02_DESIGN_DNA.md) | Actual tokens, typography, assets, contrast and discrepancies |
| [03_ROLE_UX_MAP.md](03_ROLE_UX_MAP.md) | Seven role experiences, source routing, workflow priorities and permission caveats |
| [04_UI_PROBLEM_MAP.md](04_UI_PROBLEM_MAP.md) | Prioritized issues, impact, evidence and recommendations across eight categories |
| [05_DESIGN_DIRECTION_A.md](05_DESIGN_DIRECTION_A.md) | Refined Travel Platform: 24 design dimensions and ten representative screens |
| [06_DESIGN_DIRECTION_B.md](06_DESIGN_DIRECTION_B.md) | Modern Platform / Operations: 24 design dimensions and ten representative screens |
| [07_DESIGN_DIRECTION_C.md](07_DESIGN_DIRECTION_C.md) | Contemporary Premium Hybrid: 24 design dimensions and ten representative screens |
| [08_COMPONENT_SYSTEM_PROPOSAL.md](08_COMPONENT_SYSTEM_PROPOSAL.md) | Existing component disposition, four-layer proposal and role-adapted dashboard framework |
| [09_SCREEN_PRIORITY_MAP.md](09_SCREEN_PRIORITY_MAP.md) | Screen existence, priorities, direction-specific screen and responsive specifications |
| [10_IMPLEMENTATION_SCOPE_DRAFT.md](10_IMPLEMENTATION_SCOPE_DRAFT.md) | Future dependencies, staged migration and validation; no authorization |
| [12_DESIGN_RESEARCH.md](12_DESIGN_RESEARCH.md) | Eight official pattern references, observations vs inference and copying boundaries |

Detailed direction documents govern direction-specific treatments. The priority map supplies the common screen/workflow contract. All proposed values and screens remain proposals.

## Consequential findings

Public navigation and sign-in disappear at 390px without a mobile menu. The local shared 244px sidebar leaves only 146px of canvas at that viewport. A listing booking modal does not close on Escape and lacks a complete accessible focus contract; contact inputs lack programmatic label associations. Static growth/health claims, fallback ratings and unmarked community examples can be mistaken for real evidence. Failure and true-empty states are often conflated. Traveler entry/data context needs a product decision; operational and personal scopes must not be inferred from the demo's visual role switch. Per-night listing price treatment needs an authoritative duration/unit contract before a unified booking review can be specified as supported behavior.

Retain deep green `#0F3D37`, gold `#C8A96B`, ivory `#F8F5EF`, sandstone `#E8DFD1`, emerald `#2A7A6B` and navy `#112234`, the real logo, Manrope/Inter plus Arabic typography and the serious religious/travel context. Resolve actual named-token vs semantic-HSL discrepancies deliberately in the later phase. Gold is an accent, not small white-on-gold text or a universal status color.

## Three directions — no winner selected

These are specification-based tradeoffs, not measured usability outcomes. Complexity is relative to the inspected fragmented component system; it is not an engineering estimate.

| Dimension | Direction A | Direction B | Direction C |
|---|---|---|---|
| Landing impact | Hospitality-led split hero and purposeful travel imagery | Workflow-led product preview and structured role explanation | Asymmetric editorial hero and ruled journey structure |
| Dashboard quality | Comfortable task hierarchy and readable records | Compact queues, strong tables and precise filter hierarchy | Balanced queues and summaries with a more distinctive shell |
| Traveler UX | Strong emphasis on personal journey and calm discovery | Clear personal workspace; requires friendly language to avoid institutional tone | Journey-led discovery combined with structured transaction detail |
| Operator UX | Comfortable rows; dense work needs compact variants | Operations-first density and rapid record navigation | Balanced task density with deliberate role context |
| B2B scalability | Shared foundations; requires disciplined density adaptation | Most directly aligned with repeated CRUD/queue patterns | Scalable shared framework with more composition rules to maintain |
| Visual distinctiveness | Warm premium travel character; imagery quality matters | Restrained professional platform character; less editorial distinction | Strongest compositional distinction through asymmetry and ruled structure |
| Brand continuity | Green/gold with warm current neutrals | Green/gold retained with proposed cooler canvas | Green/gold and ivory retained with selective navy governance context |
| Mobile suitability | Journey cards and comfortable single-column reading | Task lists and filter sheets; compact desktop density transforms | Simplified editorial rhythm plus role-specific task lists |
| Implementation complexity | Moderate; image selection and density variants add work | Moderate; repeated tables/forms require systematic consolidation | Relatively higher; asymmetric layouts and balanced density need more review |
| Main tradeoff | Warmth and whitespace can increase operational scroll | Operational clarity can feel less hospitable to travelers | Distinction adds composition and responsive-maintenance complexity |

## Image packs and comparison method

Generate four visuals per direction from the exact files:

- [image-prompts/DIRECTION_A.md](image-prompts/DIRECTION_A.md)
- [image-prompts/DIRECTION_B.md](image-prompts/DIRECTION_B.md)
- [image-prompts/DIRECTION_C.md](image-prompts/DIRECTION_C.md)

Each contains Public Landing Page, **proposed** Traveler Dashboard, Operator Dashboard and Super Admin Dashboard prompts. No images were generated in this discovery loop. Static images cannot prove interaction, accessibility, permissions or booking/payment capability.

Compare paired screens at the same rendered scale; all app concepts use 1440 × 1000. Direction B's landing prompt requests a taller 1440 × 1800 composition; compare the first 1000px against A/C, then evaluate its additional sections separately. Do not reward a direction merely for showing more content. Keep the same exact copy, empty/unavailable-data conventions and actual logo reference policy. Reject random text, fabricated proof/metrics, weak contrast, oversized floating cards, neon/glass/gradient decoration or lost role identity.

Review landing hierarchy, personal journey clarity, operator work prioritization and the distinct governance scope together. Follow images with an interactive responsive prototype in the later authorized phase; a static image cannot select a working navigation/transaction model.

## Decisions the owner must make

Select A, B or C after visual review. Confirm traveler entry, pricing/transaction commitment, real capability and trust claims, target languages and approved imagery. Any mix of direction treatments should be recorded as one coherent selected system rather than three conflicting component styles. No winner is chosen here.

## Evidence and limits

The live public route families and all eight published guides were inspected; representative local screens were rendered across all seven dashboard types, with focused marketplace/booking/traveler/mobile checks. Source inspection covers additional management/detail screens. Coverage, transient screenshots and settled observations are distinguished in the audit and JSON evidence logs. Production authenticated dashboards were not accessed; local demo personas reuse an operator session and do not establish real role permissions. Native mobile source was inspected, but no native runtime was audited. No accessibility certification, successful checkout, live integration or end-to-end role test is claimed.

Screenshot evidence is in [evidence/](evidence/); route observations are in [live-route-snapshots.json](evidence/live-route-snapshots.json) and [local-route-snapshots.json](evidence/local-route-snapshots.json). The public marketplace initially showed loading; the separate settled screenshot records its final empty presentation. Failure root cause was not established. No registration, booking, payment, inquiry, message or content mutation was submitted during inspection.

## Workspace and stop boundary

The authoritative checkout `/Users/macbook/Projects/umrah-connects` and its `umrahconnects` remote were verified before discovery. Pre-existing modifications/untracked engineering artifacts were left alone. This session created only documentation/design evidence under `docs/ui-ux/`; it did not change application source, CSS, Tailwind, tokens, backend, API, auth, database or infrastructure, commit or deploy. Existing local processes were reused and left running; temporary audit browser tabs were closed.

**NO — DESIGN DISCOVERY ONLY.** Generate A/B/C visual mockups, obtain product-owner selection and obtain explicit implementation authorization before changing the product.

**CODEX UI DISCOVERY GATE: COMPLETE**
