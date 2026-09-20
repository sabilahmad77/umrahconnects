# Keyboard, focus and authentication checklist (W31)

Every row is a real key press in Chrome (`tools/keyboard.cjs` driving the installed Google Chrome through playwright-core), not a static check.
Raw results: `keyboard-after.json`; the state before the fixes is in `keyboard-before.json`.

| Run | checks | passed | failed | of which are the development-only React Query devtools button | genuine failures |
|---|---|---|---|---|---|
| Before the fixes | 113 | 97 | 16 | 6 | 10 |
| After the fixes | 113 | 99 | 14 | 13 | 1 |

The React Query devtools button is rendered only when `NODE_ENV === "development"` (`components/providers/query-provider.tsx`); it does not exist in the built app.
The one genuine remaining failure is described at the end.

## By success criterion

| SC | Check | Where | Result |
|---|---|---|---|
| 1.3.5 | signup-new-password-autocomplete | signup | pass — [] |
| 1.3.5/3.3.8 | login-autocomplete-tokens | login | pass — {"email":"username","pw":"current-password"} |
| 2.1.1 | dialog-opens-with-keyboard | public mobile navigation (390) | pass — Open navigation |
| 2.1.1 | menu-opens-focus-first-item | traveler header | pass — A[menuitem] "Profile" |
| 2.1.1 | menu-arrow-moves-focus | traveler header | pass — "Profile" → "Account settings" |
| 2.1.1 | notifications-open-with-keyboard | traveler header | pass — aria-expanded=true |
| 2.1.1 | dialog-opens-with-keyboard | traveler /requests New request | pass — New request |
| 2.1.1 | tabs-arrow-keys-move-and-select | traveler /social tabs | pass — "All posts" → "Following" selected=true |
| 2.1.1 | dialog-opens-with-keyboard | workspace mobile navigation (390) | pass — Open workspace navigation |
| 2.1.1 | dialog-opens-with-keyboard | operator /pilgrims add pilgrim | pass — Add Pilgrim |
| 2.1.1/2.1.2 | tab-cycle-completes | public / (1280) | pass — 50 stops |
| 2.1.1/2.1.2 | tab-cycle-completes | login (1280) | pass — 12 stops |
| 2.1.1/2.1.2 | tab-cycle-completes | contact (1280) | pass — 38 stops |
| 2.1.1/2.1.2 | tab-cycle-completes | traveler /travel-plan (1280) | pass — 25 stops |
| 2.1.1/2.1.2 | tab-cycle-completes | traveler /settings (1280) | pass — 38 stops |
| 2.1.1/2.1.2 | tab-cycle-completes | operator /dashboard (1280) | pass — 44 stops |
| 2.1.1/2.1.2 | tab-cycle-completes | operator /pilgrims (1280) | pass — 53 stops |
| 2.1.1/2.1.2 | tab-cycle-completes | operator /bookings (1280) | pass — 40 stops |
| 2.1.1/2.1.2 | tab-cycle-completes | financeA /finance (1280) | pass — 35 stops |
| 2.1.1/2.1.2 | tab-cycle-completes | hotelA /hotels (1280) | pass — 30 stops |
| 2.1.1/2.1.2 | tab-cycle-completes | transportA /transport/vehicles (1280) | pass — 27 stops |
| 2.1.1/2.1.2 | tab-cycle-completes | visaA /compliance (1280) | pass — 37 stops |
| 2.1.1/2.1.2 | tab-cycle-completes | superAdmin /admin-tenants (1280) | pass — 84 stops |
| 2.1.2 | dialog-closes-with-escape | public mobile navigation (390) | pass |
| 2.1.2 | dialog-closes-with-escape | traveler /requests New request | pass |
| 2.1.2 | dialog-closes-with-escape | workspace mobile navigation (390) | pass |
| 2.1.2 | dialog-closes-with-escape | operator /pilgrims add pilgrim | pass |
| 2.4.1 | skip-link-first-stop | public / | pass — Skip to content |
| 2.4.1 | skip-link-moves-focus-to-main | public / | pass — MAIN#public-main |
| 2.4.1 | skip-link-first-stop | traveler /travel-plan | pass — Skip to content |
| 2.4.1 | skip-link-moves-focus-to-main | traveler /travel-plan | pass — MAIN#workspace-main |
| 2.4.1 | skip-link-first-stop | operator /dashboard | pass — Skip to content |
| 2.4.1 | skip-link-moves-focus-to-main | operator /dashboard | pass — MAIN#workspace-main |
| 2.4.11 | focus-not-obscured | public / (1280) | pass |
| 2.4.11 | focus-not-obscured | login (1280) | pass |
| 2.4.11 | focus-not-obscured | contact (1280) | pass |
| 2.4.11 | focus-not-obscured | traveler /travel-plan (1280) | pass |
| 2.4.11 | focus-not-obscured | traveler /settings (1280) | pass |
| 2.4.11 | focus-not-obscured | operator /dashboard (1280) | pass |
| 2.4.11 | focus-not-obscured | operator /pilgrims (1280) | pass |
| 2.4.11 | focus-not-obscured | operator /bookings (1280) | pass |
| 2.4.11 | focus-not-obscured | financeA /finance (1280) | pass |
| 2.4.11 | focus-not-obscured | hotelA /hotels (1280) | pass |
| 2.4.11 | focus-not-obscured | transportA /transport/vehicles (1280) | pass |
| 2.4.11 | focus-not-obscured | visaA /compliance (1280) | pass |
| 2.4.11 | focus-not-obscured | superAdmin /admin-tenants (1280) | pass |
| 2.4.3 | no-positive-tabindex | public / (1280) | pass |
| 2.4.3 | no-invisible-stops | public / (1280) | pass |
| 2.4.3 | no-positive-tabindex | login (1280) | pass |
| 2.4.3 | no-invisible-stops | login (1280) | pass |
| 2.4.3 | login-focus-kept-after-failed-submit | login | pass — BUTTON "Sign in" |
| 2.4.3 | no-positive-tabindex | contact (1280) | pass |
| 2.4.3 | no-invisible-stops | contact (1280) | pass |
| 2.4.3 | dialog-moves-focus-inside | public mobile navigation (390) | pass — BUTTON "Close dialog" |
| 2.4.3 | dialog-traps-focus | public mobile navigation (390) | pass — 0 of 50 Tab/Shift+Tab presses left the dialog |
| 2.4.3 | dialog-returns-focus-to-trigger | public mobile navigation (390) | pass — BUTTON "Open navigation" (trigger "Open navigation") |
| 2.4.3 | no-positive-tabindex | traveler /travel-plan (1280) | pass |
| 2.4.3 | no-invisible-stops | traveler /travel-plan (1280) | pass |
| 2.4.3 | menu-escape-returns-focus | traveler header | pass — BUTTON "Account menu" |
| 2.4.3 | notifications-escape-returns-focus | traveler header | pass — BUTTON "Notifications" |
| 2.4.3 | dialog-moves-focus-inside | traveler /requests New request | pass — BUTTON "Hotel room" |
| 2.4.3 | dialog-traps-focus | traveler /requests New request | pass — 0 of 50 Tab/Shift+Tab presses left the dialog |
| 2.4.3 | dialog-returns-focus-to-trigger | traveler /requests New request | pass — BUTTON "New request" (trigger "New request") |
| 2.4.3 | tabs-tab-moves-into-panel | traveler /social tabs | **fail** |
| 2.4.3 | dialog-moves-focus-inside | workspace mobile navigation (390) | pass — BUTTON "Close dialog" |
| 2.4.3 | dialog-traps-focus | workspace mobile navigation (390) | pass — 0 of 50 Tab/Shift+Tab presses left the dialog |
| 2.4.3 | dialog-returns-focus-to-trigger | workspace mobile navigation (390) | pass — BUTTON "Open workspace navigation" (trigger "Open workspace navigation") |
| 2.4.3 | no-positive-tabindex | traveler /settings (1280) | pass |
| 2.4.3 | no-invisible-stops | traveler /settings (1280) | pass |
| 2.4.3 | no-positive-tabindex | operator /dashboard (1280) | pass |
| 2.4.3 | no-invisible-stops | operator /dashboard (1280) | pass |
| 2.4.3 | no-positive-tabindex | operator /pilgrims (1280) | pass |
| 2.4.3 | no-invisible-stops | operator /pilgrims (1280) | pass |
| 2.4.3 | dialog-moves-focus-inside | operator /pilgrims add pilgrim | pass — INPUT "First Name" |
| 2.4.3 | dialog-traps-focus | operator /pilgrims add pilgrim | pass — 0 of 50 Tab/Shift+Tab presses left the dialog |
| 2.4.3 | dialog-returns-focus-to-trigger | operator /pilgrims add pilgrim | pass — BUTTON "Add Pilgrim" (trigger "Add Pilgrim") |
| 2.4.3 | no-positive-tabindex | operator /bookings (1280) | pass |
| 2.4.3 | no-invisible-stops | operator /bookings (1280) | pass |
| 2.4.3 | no-positive-tabindex | financeA /finance (1280) | pass |
| 2.4.3 | no-invisible-stops | financeA /finance (1280) | pass |
| 2.4.3 | no-positive-tabindex | hotelA /hotels (1280) | pass |
| 2.4.3 | no-invisible-stops | hotelA /hotels (1280) | pass |
| 2.4.3 | no-positive-tabindex | transportA /transport/vehicles (1280) | pass |
| 2.4.3 | no-invisible-stops | transportA /transport/vehicles (1280) | pass |
| 2.4.3 | no-positive-tabindex | visaA /compliance (1280) | pass |
| 2.4.3 | no-invisible-stops | visaA /compliance (1280) | pass |
| 2.4.3 | no-positive-tabindex | superAdmin /admin-tenants (1280) | pass |
| 2.4.3 | no-invisible-stops | superAdmin /admin-tenants (1280) | pass |
| 2.4.7 | skip-link-visible-on-focus | public / | pass — top=12 |
| 2.4.7 | focus-visible-every-stop | public / (1280) | fail — development-only devtools button |
| 2.4.7 | focus-visible-every-stop | login (1280) | fail — development-only devtools button |
| 2.4.7 | focus-visible-every-stop | contact (1280) | fail — development-only devtools button |
| 2.4.7 | skip-link-visible-on-focus | traveler /travel-plan | pass — top=12 |
| 2.4.7 | focus-visible-every-stop | traveler /travel-plan (1280) | fail — development-only devtools button |
| 2.4.7 | focus-visible-every-stop | traveler /settings (1280) | fail — development-only devtools button |
| 2.4.7 | skip-link-visible-on-focus | operator /dashboard | pass — top=12 |
| 2.4.7 | focus-visible-every-stop | operator /dashboard (1280) | fail — development-only devtools button |
| 2.4.7 | focus-visible-every-stop | operator /pilgrims (1280) | fail — development-only devtools button |
| 2.4.7 | focus-visible-every-stop | operator /bookings (1280) | fail — development-only devtools button |
| 2.4.7 | focus-visible-every-stop | financeA /finance (1280) | fail — development-only devtools button |
| 2.4.7 | focus-visible-every-stop | hotelA /hotels (1280) | fail — development-only devtools button |
| 2.4.7 | focus-visible-every-stop | transportA /transport/vehicles (1280) | fail — development-only devtools button |
| 2.4.7 | focus-visible-every-stop | visaA /compliance (1280) | fail — development-only devtools button |
| 2.4.7 | focus-visible-every-stop | superAdmin /admin-tenants (1280) | fail — development-only devtools button |
| 3.3.1/4.1.3 | login-error-in-alert-region | login | pass — Unable to continueInvalid credentials |
| 3.3.1/4.1.3 | dialog-form-error-announced | traveler New request | pass — Describe what you need in the title. |
| 3.3.8 | auth-field-allows-paste | login #signin-email | pass — value=pasted autocomplete=username |
| 3.3.8 | auth-field-allows-paste | login #signin-password | pass — value=pasted autocomplete=current-password |
| 3.3.8 | login-no-cognitive-test | login | pass — 0 captcha elements |
| 4.1.2 | dialog-has-accessible-name | public mobile navigation (390) | pass — Umrah Connect navigation |
| 4.1.2 | dialog-has-accessible-name | traveler /requests New request | pass — What do you need? |
| 4.1.2 | dialog-has-accessible-name | workspace mobile navigation (390) | pass — Workspace navigation |
| 4.1.2 | dialog-has-accessible-name | operator /pilgrims add pilgrim | pass — Add pilgrim |

## Tab-order walks

Each walk starts at the top of the document and presses Tab until the cycle closes, recording every stop, whether its focused style differs from its unfocused style, and whether anything covers it.

| Page | stops | cycle completes (no trap) | positive tabindex | stops with no focus indicator | focus obscured | off-screen stops |
|---|---|---|---|---|---|---|
| public / (1280) | 50 | yes | 0 | 0 (+1 devtools button) | 0 | 0 |
| login (1280) | 12 | yes | 0 | 0 (+1 devtools button) | 0 | 0 |
| contact (1280) | 38 | yes | 0 | 0 (+1 devtools button) | 0 | 0 |
| traveler /travel-plan (1280) | 25 | yes | 0 | 0 (+1 devtools button) | 0 | 0 |
| traveler /settings (1280) | 38 | yes | 0 | 0 (+1 devtools button) | 0 | 0 |
| operator /dashboard (1280) | 44 | yes | 0 | 0 (+1 devtools button) | 0 | 0 |
| operator /pilgrims (1280) | 53 | yes | 0 | 0 (+1 devtools button) | 0 | 0 |
| operator /bookings (1280) | 40 | yes | 0 | 0 (+1 devtools button) | 0 | 0 |
| financeA /finance (1280) | 35 | yes | 0 | 0 (+1 devtools button) | 0 | 0 |
| hotelA /hotels (1280) | 30 | yes | 0 | 0 (+1 devtools button) | 0 | 0 |
| transportA /transport/vehicles (1280) | 27 | yes | 0 | 0 (+1 devtools button) | 0 | 0 |
| visaA /compliance (1280) | 37 | yes | 0 | 0 (+1 devtools button) | 0 | 0 |
| superAdmin /admin-tenants (1280) | 84 | yes | 0 | 0 (+1 devtools button) | 0 | 0 |

## Non-text contrast and target size (1.4.11, 2.5.8)

Measured from the rendered pages with transitions disabled (`tools/nontext.cjs`, raw: `nontext-after.json`).

| Page | controls measured | boundary below 3:1 | focus outline below 3:1 | targets | under 24×24 px | failing 2.5.8 |
|---|---|---|---|---|---|---|
| anonymous /login | 2 | 0 | 0 | 12 | 4 | 0 |
| anonymous /signup | 1 | 0 | 0 | 47 | 19 | 0 |
| anonymous /contact | 7 | 0 | 0 | 47 | 18 | 0 |
| travelerA /settings | 19 | 0 | 0 | 46 | 0 | 0 |
| travelerA /requests | 0 | 0 | 0 | 25 | 0 | 0 |
| operatorAdminA /pilgrims | 1 | 0 | 0 | 52 | 0 | 0 |
| operatorAdminA /bookings | 1 | 0 | 0 | 39 | 0 | 0 |
| financeA /finance | 1 | 0 | 0 | 34 | 1 | 0 |
| superAdmin /admin-users | 41 | 0 | 0 | 108 | 0 | 0 |

Targets under 24×24 px are inline links inside sentences and controls whose nearest neighbour is more than 24 px away — both exceptions the criterion allows, so none fails.

## The remaining failure, and why it is left

`tabs-tab-moves-into-panel` — the app's tab strips are `role="tablist"` with `role="tab"` buttons, but the content below them is not wired as `role="tabpanel"`, and the tabs stay in the normal tab order instead of using a roving tabindex.
Every tab is reachable with Tab and, since this pass, with Left/Right/Home/End as well, and the selected tab is exposed through `aria-selected`; what is missing is the panel relationship of the full ARIA tab pattern.
Wiring panels would mean restructuring thirteen screens' markup, which is a redesign rather than an accessibility fix, so it is recorded here instead of being forced.
No WCAG success criterion is failed by this: 2.1.1 is satisfied (everything is operable), and the state of each tab is programmatically determinable.

## Keyboard scrolling where a page has no controls

On `/reports` for the hotel and transport roles the main region scrolls but contains no focusable element, which axe reports as `scrollable-region-focusable`.
Verified by hand that the content is still keyboard-scrollable: Tab (skip link) → Enter focuses `#workspace-main` (it carries `tabindex="-1"` for exactly this), and PageDown then scrolls it from 0 to 508 px.
