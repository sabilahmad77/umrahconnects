# Responsive acceptance (W30) and reflow / resize text (1.4.10, 1.4.4)

State after this branch's fixes, measured on its own stack. The run that found
the defects (against the candidate production build) is in `RESULTS-before.md`.

Measured against `http://localhost:3411` on 2026-09-20 21:22 UTC.

Measured in Chrome at each width with `tools/responsive.cjs`: the document and the workspace main region are checked for horizontal scroll, every element painted past the right edge is listed, every horizontal scroller is checked for a name, and text that is actually cut off by a box is reported. Raw data: `responsive.json`; screenshots in `screenshots/`.

Widths: 1440 px, 1280 px, 1024 px, 768 px, 390 px, 360 px (plus 320 px for reflow and 1280 px at 200 % text size).

196 measurements, 1 problems.

## Horizontal scroll by route and width

A cell shows the page-level horizontal overflow in pixels; `0` is the pass condition.

| Identity | Route | 1440px | 1280px | 1024px | 768px | 390px | 360px |
|---|---|---|---|---|---|---|---|
| anonymous | `/` | 0 | 0 | 0 | 0 | 0 | 0 |
| anonymous | `/solutions` | 0 | 0 | 0 | 0 | 0 | 0 |
| anonymous | `/marketplace-preview` | 0 | 0 | 0 | 0 | 0 | 0 |
| anonymous | `/contact` | 0 | 0 | 0 | 0 | 0 | 0 |
| anonymous | `/signup` | 0 | 0 | 0 | 0 | 0 | 0 |
| travelerA | `/travel-plan` | 0 | 0 | 0 | 0 | 0 | 0 |
| travelerA | `/travel-plan (drawer)` | — | — | — | — | — | 0 |
| travelerA | `/marketplace` | 0 | 0 | 0 | 0 | 0 | 0 |
| travelerA | `/requests` | 0 | 0 | 0 | 0 | 0 | 0 |
| travelerA | `/settings` | 0 | 0 | 0 | 0 | 0 | 0 |
| operatorAdminA | `/dashboard` | 0 | 0 | 0 | 0 | 0 | 0 |
| operatorAdminA | `/dashboard (drawer)` | — | — | — | — | — | 0 |
| operatorAdminA | `/pilgrims` | 0 | 0 | 0 | 0 | 0 | 0 |
| operatorAdminA | `/bookings` | 0 | 0 | 0 | 0 | 0 | 0 |
| operatorAdminA | `/finance` | 0 | 0 | 0 | 0 | 0 | 0 |
| operatorAdminA | `/reports` | 0 | 0 | 0 | 0 | 0 | 0 |
| financeA | `/finance-dashboard` | 0 | 0 | 0 | 0 | 0 | 0 |
| financeA | `/finance-dashboard (drawer)` | — | — | — | — | — | 0 |
| financeA | `/finance-payments` | 0 | 0 | 0 | 0 | 0 | 0 |
| financeA | `/budget-plans` | 0 | 0 | 0 | 0 | 0 | 0 |
| hotelA | `/hotel-dashboard` | 0 | 0 | 0 | 0 | 0 | 0 |
| hotelA | `/hotel-dashboard (drawer)` | — | — | — | — | — | 0 |
| hotelA | `/hotels` | 0 | 0 | 0 | 0 | 0 | 0 |
| hotelA | `/hotel-bookings` | 0 | 0 | 0 | 0 | 0 | 0 |
| transportA | `/transport-dashboard` | 0 | 0 | 0 | 0 | 0 | 0 |
| transportA | `/transport-dashboard (drawer)` | — | — | — | — | — | 0 |
| transportA | `/transport/vehicles` | 0 | 0 | 0 | 0 | 0 | 0 |
| transportA | `/transport/assignments` | 0 | 0 | 0 | 0 | 0 | 0 |
| visaA | `/visa-dashboard` | 0 | 0 | 0 | 0 | 0 | 0 |
| visaA | `/visa-dashboard (drawer)` | — | — | — | — | — | 0 |
| visaA | `/compliance` | 0 | 0 | 0 | 0 | 0 | 0 |
| visaA | `/visa-requests` | 0 | 0 | 0 | 0 | 0 | 0 |
| superAdmin | `/admin-dashboard` | 0 | 0 | 0 | 0 | 0 | 0 |
| superAdmin | `/admin-dashboard (drawer)` | — | — | — | — | — | 0 |
| superAdmin | `/admin-tenants` | 0 | 0 | 0 | 0 | 0 | 0 |
| superAdmin | `/admin-users` | 0 | 0 | 0 | 0 | 0 | 0 |
| superAdmin | `/admin-listings` | 0 | 0 | 0 | 0 | 0 | 0 |

## What each role was checked on

| Identity | role | routes |
|---|---|---|
| anonymous | signed out (public site) | `/`, `/contact`, `/marketplace-preview`, `/signup`, `/solutions` |
| travelerA | PILGRIM | `/marketplace`, `/requests`, `/settings`, `/travel-plan`, `/travel-plan (drawer)` |
| operatorAdminA | OPERATOR_ADMIN | `/bookings`, `/dashboard`, `/dashboard (drawer)`, `/finance`, `/pilgrims`, `/reports` |
| financeA | FINANCE_MANAGER | `/budget-plans`, `/finance-dashboard`, `/finance-dashboard (drawer)`, `/finance-payments` |
| hotelA | HOTEL_MANAGER | `/hotel-bookings`, `/hotel-dashboard`, `/hotel-dashboard (drawer)`, `/hotels` |
| transportA | TRANSPORT_MANAGER | `/transport-dashboard`, `/transport-dashboard (drawer)`, `/transport/assignments`, `/transport/vehicles` |
| visaA | VISA_OFFICER | `/compliance`, `/visa-dashboard`, `/visa-dashboard (drawer)`, `/visa-requests` |
| superAdmin | SUPER_ADMIN | `/admin-dashboard`, `/admin-dashboard (drawer)`, `/admin-listings`, `/admin-tenants`, `/admin-users` |

## Tables, navigation and dialogs at small widths

| Check | Result |
|---|---|
| Mobile navigation button present on every workspace route at 390 and 360 px | 50/50 |
| Sidebar takes no width at 390 and 360 px | 50/50 |
| Navigation drawer opens without pushing the page sideways | 7/7 |
| Table scrollers that carry a name (tables may scroll inside a labelled region) | 37/38 |
| Table scrollers reachable with the keyboard (`tabindex=0`) | 37/38 |

## Reflow at 320 CSS px (1.4.10)

| Route | page overflow | main overflow | horizontal scrollers | text cut off |
|---|---|---|---|---|
| `/dashboard` | 0 | 0 | 0 | 0 |
| `/pilgrims` | 0 | 0 | 1 | 0 |
| `/bookings` | 0 | 0 | 1 | 0 |
| `/finance` | 0 | 0 | 1 | 0 |
| `/settings` | 0 | 4 | 1 | 0 |

## Text size doubled at 1280 px (1.4.4)

The root font size is set to 200 %, so every rem-based size doubles while the viewport stays 1280 px.

| Route | page overflow | text cut off |
|---|---|---|
| `/dashboard` | 0 | 0 |
| `/pilgrims` | 0 | 0 |
| `/finance` | 0 | 0 |
| `/settings` | 0 | 0 |

## Landing hero

| Width | headline | headline inside the viewport | headline clipped | call to action inside the viewport | page overflow |
|---|---|---|---|---|---|
| 1440 | "One platform for every Umrah journey." | yes | no | yes | 0 |
| 1280 | "One platform for every Umrah journey." | yes | no | yes | 0 |
| 1024 | "One platform for every Umrah journey." | yes | no | yes | 0 |
| 768 | "One platform for every Umrah journey." | yes | no | yes | 0 |
| 390 | "One platform for every Umrah journey." | yes | no | yes | 0 |
| 360 | "One platform for every Umrah journey." | yes | no | yes | 0 |
| 320 | "One platform for every Umrah journey." | yes | no | yes | 0 |

## Problems

The single problem below was found by this run and fixed straight after it
(`fix(responsive): the pilgrims header wraps instead of overflowing at 360 px`):
the pilgrims title and its two actions shared one non-wrapping row, so at 360 px
the workspace content area scrolled sideways by 6 px. Re-measured after the fix
on the same page and width: the main region's scrollWidth equals its clientWidth
(360 = 360).

| Identity | Route | Width | Problem |
|---|---|---|---|
| operatorAdminA | `/pilgrims` | 360 | main scrolls horizontally by 6px; table scroller without a label (MAIN) |
