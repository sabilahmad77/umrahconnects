# Current Design DNA — Umrah Connect

Date: 17 September 2026. Evidence: local source inspection in the verified authoritative checkout. This file distinguishes configured tokens from rendered behavior; runtime observations belong in `01_CURRENT_UI_AUDIT.md`. No token, stylesheet, component, or configuration was modified.

## Preserve these identity anchors

Deep Umrah Green, restrained warm gold, ivory/sandstone surfaces, the existing Umrah Connect name and logo, pilgrimage/travel context, Manrope headings, Inter interface text, and the Arabic companion family already form a coherent identity. The opportunity is to make their application consistent rather than invent another brand.

| Identity token | Exact named value | Evidence |
|---|---|---|
| Primary / Deep Umrah Green | `#0F3D37` | [Tailwind:63](/Users/macbook/Projects/umrah-connects/apps/web/tailwind.config.ts:63) |
| Gold accent | `#C8A96B` | [Tailwind:76](/Users/macbook/Projects/umrah-connects/apps/web/tailwind.config.ts:76) |
| Emerald accent | `#2A7A6B`, hover/deeper `#216154` | [Tailwind:83](/Users/macbook/Projects/umrah-connects/apps/web/tailwind.config.ts:83) |
| Midnight Navy | `#112234` | [Tailwind:84](/Users/macbook/Projects/umrah-connects/apps/web/tailwind.config.ts:84) |
| Sandstone / Ivory Mist | `#E8DFD1` / `#F8F5EF` | [Tailwind:85](/Users/macbook/Projects/umrah-connects/apps/web/tailwind.config.ts:85) |
| Text primary / secondary / border | `#1A1F23` / `#5E6974` / `#D9D7D0` | [Native brand constants](/Users/macbook/Projects/umrah-connects/apps/mobile/lib/theme.ts:16) |
| Brandmark | Actual PNG symbol, not a newly generated logo | [Public Brandmark](/Users/macbook/Projects/umrah-connects/apps/web/components/public/public-chrome.tsx:12) |

Assets present in `apps/web/public`: `logo-mark.png`, `logo-mark-light.png`, `logo-horizontal.png`, `logo-horizontal-light.png`, `favicon.png`, `icon-512.png`. Preserve approved assets; verify image crops/legibility in concept reviews. The public chrome uses the light symbol inside a green container. The root viewport theme color is the exact green [layout:29](/Users/macbook/Projects/umrah-connects/apps/web/app/layout.tsx:29).

## Actual named palettes

These are literal configured values, not speculative replacements. `saudi` duplicates `brand` as a compatibility alias [Tailwind:88](/Users/macbook/Projects/umrah-connects/apps/web/tailwind.config.ts:88).

| Step | Brand green | Gold |
|---|---|---|
| 50 | `#E7EFEC` | `#F7F1E4` |
| 100 | `#CDE0DA` | `#EFE3C7` |
| 200 | `#A7C7BE` | `#E2CE9F` |
| 300 | `#6FA197` | `#D4B97A` |
| 400 | `#357A6E` | `#CDB074` |
| 500 | `#0F3D37` | `#C8A96B` |
| 600 | `#0B2E2A` | `#A8894B` |
| 700 | `#081F1C` | `#876B36` |
| 800 | `#061513` | `#5E4A25` |
| 900 | `#030A09` | `#3A2E17` |

Full source: [Tailwind palettes](/Users/macbook/Projects/umrah-connects/apps/web/tailwind.config.ts:57).

## Semantic CSS values are a second, slightly different system

Do not assume comments describing a hex equal the browser's HSL output. For example `bg-brand-500` is exact `#0F3D37`, while `bg-primary` resolves from `172 61% 15%`, approximately `#0F3E37`. HSL conversions below are rounded to the nearest 8-bit sRGB channel; actual CSS can retain fractional channels.

| Light semantic token | Actual HSL | Approximate hex |
|---|---|---|
| background | `40 39% 95%` | `#F7F4ED` |
| foreground / card text | `210 14% 12%` | `#1A1F23` |
| card / popover | `0 0% 100%` | `#FFFFFF` |
| primary / ring | `172 61% 15%` | `#0F3E37` |
| primary foreground | `0 0% 100%` | `#FFFFFF` |
| secondary / its foreground | `40 30% 92%` / `172 40% 15%` | `#F1EDE4` / `#173631` |
| muted / its foreground | `40 25% 93%` / `205 11% 41%` | `#F2EFE9` / `#5D6A74` |
| accent / its foreground | `40 46% 60%` / `172 61% 12%` | `#C8A96A` / `#0C312C` |
| destructive | `0 44% 49%` | `#B44646` |
| border / input | `45 13% 84%` | `#DCD9D1` |

Source: [light semantic tokens](/Users/macbook/Projects/umrah-connects/apps/web/app/globals.css:7). The discrepancy is small visually but important when documenting exact color values or sharing design files. After direction selection, choose one canonical value per semantic role and map both platforms to it; do not change the brand merely to resolve the discrepancy.

Dark configuration exists [globals:33](/Users/macbook/Projects/umrah-connects/apps/web/app/globals.css:33): background `210 51% 14%`, card/popover `172 45% 10%`, text `40 39% 95%`, primary gold `40 46% 60%` with green text `172 61% 10%`, secondary `172 30% 18%`, muted `172 25% 16%`, muted text `40 15% 75%`, accent emerald `168 49% 32%`, borders `172 25% 20%`, gold ring. `darkMode: ['class']` is configured. No theme provider or class-toggle implementation was found in the scanned web app. Literal `bg-white` and `text-gray-*` usage means configuration alone does not establish full dark-mode support.

Native status colors are explicitly branded: success `#1E8E5A`, warning `#C98A13`, error `#B54747`, info `#2D6CDF`, auxiliary purple `#6E59A5` [native theme](/Users/macbook/Projects/umrah-connects/apps/mobile/lib/theme.ts:57). Web statuses mostly use Tailwind's stock green/yellow/red/blue families, with a semantic destructive token but no corresponding complete semantic success/warning/info family. This is a platform divergence, not evidence that every existing badge is inaccessible.

## Typography and localization

| Layer | Actual definition | Refinement implication |
|---|---|---|
| Web UI/body | Inter variable, Inter/system fallback | Retain; use a documented reading scale |
| Web headings | Manrope variable; all h1–h6 `letter-spacing: -0.01em` | Retain; use semantic heading levels with clear sizes |
| Arabic | IBM Plex Sans Arabic 400/500/600/700 | Retain; verify script coverage and language-specific layout |
| Native | Named Manrope 500/600/700, Inter 400/500/600/700, Arabic regular | Preserve visual kinship while respecting native rendering |

Sources: [font loading](/Users/macbook/Projects/umrah-connects/apps/web/app/layout.tsx:8), [Tailwind families](/Users/macbook/Projects/umrah-connects/apps/web/tailwind.config.ts:13), [heading/RTL CSS](/Users/macbook/Projects/umrah-connects/apps/web/app/globals.css:66), [native font definitions](/Users/macbook/Projects/umrah-connects/apps/mobile/lib/theme.ts:97). Web root language is English; `[dir="rtl"]` selects the Arabic family and contains one sidebar selector. This is partial RTL provision, not verified whole-product RTL or Urdu support.

Web has no custom font-size scale; stock utility sizes coexist with many arbitrary sizes. A reproducible string scan of 148 app/component TSX files found 196 `text-[11px]` references and 68 `text-[10px]` references. These counts indicate maintenance/legibility risk, not rendered instance counts. Tiny navigation group labels are directly evidenced at [sidebar:257](/Users/macbook/Projects/umrah-connects/apps/web/components/layout/sidebar.tsx:257). Native scale is 11/13/15/17/20/24/30 [native fontSize](/Users/macbook/Projects/umrah-connects/apps/mobile/lib/theme.ts:127). Prefer 14px minimum operational reading text and 16px form entry in future specifications; small metadata requires explicit purpose and zoom review.

## Spacing, radius, elevation, breakpoints, motion

| Foundation | Current web | Current native | Analysis |
|---|---|---|---|
| Spacing | No project override; utility usage such as p-4/p-5, gap-2/gap-4, arbitrary widths | 4/8/12/16/20/24/32 | A shared 4px rhythm already fits most components |
| Radius | `--radius: .625rem`; sm6, md8, lg10px at 16px root; stock xl12 / 2xl16 / 3xl24 coexist | sm8/md12/lg14/xl18/2xl24/full9999 | Same names mean different numbers across platforms |
| Elevation | Stock shadow-sm/md/lg/xl plus colored brand shadows | Card green shadow 6%, blur12, y4, elevation2; raised12%, blur18, y8, elevation6 | No web semantic elevation scale; excessive choice invites drift |
| Breakpoints | No custom `screens`; inherited Tailwind 3 defaults sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536 | No breakpoint map in native theme | Define responsive contracts, not device-specific guesses |
| Motion | accordion .2s ease-out, nav150ms, transition-all, animate-pulse/spin | Touchable active opacity .85; no theme motion tokens | Add reduced-motion contracts in later implementation |

Sources: [radius definitions](/Users/macbook/Projects/umrah-connects/apps/web/tailwind.config.ts:94), [native foundations](/Users/macbook/Projects/umrah-connects/apps/mobile/lib/theme.ts:108), [native shadows](/Users/macbook/Projects/umrah-connects/apps/mobile/lib/theme.ts:138), [sidebar motion](/Users/macbook/Projects/umrah-connects/apps/web/components/layout/sidebar.tsx:271). No `prefers-reduced-motion` / `motion-reduce` usage was found in the scanned web source. Stock theme inheritance follows `theme.extend`; the installed Tailwind 3.4.19 defaultTheme was read to confirm these breakpoint values.

Inherited web elevation values were also confirmed from the installed defaultTheme. `shadow-sm`: `0 1px 2px 0 rgb(0 0 0 / .05)`; `shadow`: `0 1px 3px 0 rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1)`; `shadow-md`: `0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1)`; `shadow-lg`: `0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1)`; `shadow-xl`: `0 20px 25px -5px rgb(0 0 0 / .1), 0 8px 10px -6px rgb(0 0 0 / .1)`. Colored shadow utilities change shadow color independently; they are not a separately governed semantic elevation system.

A source string scan found 418 rounded-lg / 393 rounded-2xl / 293 rounded-xl / 185 rounded-full references, and 76 shadow-sm / 29 shadow-xl / 22 shadow-brand-500/30. This does not require making every surface identical: inputs, portraits, pills and containers have different purposes. It does require defining the purpose of each radius and shadow, then consolidating duplicated recipes.

## Iconography and imagery

Lucide React is the recurring web icon set. Icons commonly range from 12 to 20px with 18px sidebar icons. Emoji also identify roles and notification types [Header:11](/Users/macbook/Projects/umrah-connects/apps/web/components/layout/header.tsx:11), [notification types](/Users/macbook/Projects/umrah-connects/apps/web/components/layout/notification-bell.tsx:9). Standardize operational roles/statuses in Lucide; keep human expression in community content when appropriate. Do not replace the existing logo with an icon.

Listing imagery has a useful actual-photo → category-photo → branded-fallback pattern [listing visual](/Users/macbook/Projects/umrah-connects/apps/web/components/marketplace/listing-visual.tsx:30). Category fallback photos use Unsplash and include generic hospitality/bus/documents/travel imagery; they must not imply an actual hotel, vehicle or verified service. Preserve honest fallback labeling and prioritize real operator-provided assets. Native has MediaPanel, category photography, and reusable brand UI [native brand](/Users/macbook/Projects/umrah-connects/apps/mobile/components/brand.tsx:111).

## Measured contrast, with limits

Computed from literal hex sRGB using linearized relative luminance and `(Llighter + .05)/(Ldarker + .05)`. These are token-pair calculations, not a live page accessibility certification. [WCAG text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) specifies 4.5:1 for normal text and 3:1 for large text.

| Pair | Ratio | Design implication |
|---|---|---|
| White on green `#0F3D37` | 12.05:1 | Strong primary CTA pairing |
| White on gold `#C8A96B` | 2.25:1 | Avoid for meaningful text, even large text |
| Green on gold | 5.36:1 | Preserve gold CTA/badge with deep-green text |
| Secondary text `#5E6974` on ivory | 5.15:1 | Good starting reading contrast |
| Error `#B54747` on white | 5.31:1 | Suitable text contrast |
| Native gray400 `#9A9790` on white | 2.92:1 | Do not use as body/empty-state copy; native EmptyState subtitle currently does |
| Slate border `#D9D7D0` on white | 1.44:1 | Fine for decorative separators; insufficient as sole essential control boundary |
| Focus green400 on navy | 3.19:1 | Useful tested focus pairing; verify other surfaces separately |

Native empty-state subtitle evidence: [UI:213](/Users/macbook/Projects/umrah-connects/apps/mobile/components/UI.tsx:213). Web global focus outline is 2px green400 [globals:95](/Users/macbook/Projects/umrah-connects/apps/web/app/globals.css:95), but several inputs specify `outline-none` and independent focus borders; runtime cascade inspection is required before claiming all focus states are visible.

## Most consequential inconsistencies

1. Two palette definitions are near matches rather than one exact mapping. Keep brand anchors, canonicalize semantics after selection.
2. Five component files inject repeated global `.input` CSS with legacy orange focus `#d4831a`: [profile:237](/Users/macbook/Projects/umrah-connects/apps/web/components/profile/profile-view.tsx:237), [hotel bookings:278](/Users/macbook/Projects/umrah-connects/apps/web/components/hotels/hotel-bookings-view.tsx:278), [assignments:325](/Users/macbook/Projects/umrah-connects/apps/web/components/transport/assignments-list.tsx:325), [transport bookings:321](/Users/macbook/Projects/umrah-connects/apps/web/components/transport/transport-bookings-view.tsx:321), [vehicle detail:401](/Users/macbook/Projects/umrah-connects/apps/web/components/transport/vehicle-detail.tsx:401). This creates mount-dependent global styling and inconsistent focus treatment.
3. Reports retain legacy orange/green chart constants [reports:13](/Users/macbook/Projects/umrah-connects/apps/web/components/reports/reports-view.tsx:13). OperationsPulse defines a brand palette at line 75 yet renders a blue booking trend at [line 276](/Users/macbook/Projects/umrah-connects/apps/web/components/dashboard/operations-pulse.tsx:276). Blue may be a valid informational role, but chart semantics need a stable shared mapping.
4. Only `confirm-dialog.tsx` is in the shared web UI directory. Radix/vaul dependencies are available in package configuration; searches found no actual imports in the current app/component code. Do not describe this as an existing complete shadcn system.
5. Native already has Card/KpiCard/StatusBadge/Button/Skeleton/EmptyState, while brand.tsx also defines PrimaryButton/GhostButton with a different radius. Preserve useful native patterns, then reconcile their variant contracts [UI:77](/Users/macbook/Projects/umrah-connects/apps/mobile/components/UI.tsx:77), [brand:162](/Users/macbook/Projects/umrah-connects/apps/mobile/components/brand.tsx:162).

The three directions should change hierarchy, density, layout, imagery and interaction emphasis while retaining these identity anchors. No direction should depend on introducing neon, excessive gradients, invented testimonials, or a substitute brand.
