# Automated WCAG audit — axe-core sweep (W31)

Tool: axe-core 4.13.0, tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa` (best-practice rules are run too and reported separately — they are not WCAG failures).

Coverage: every route under `apps/web/app` for every role that can open it, plus the page state after opening each tab panel, each creation dialog the page offers, the account menu, the notification popover, the mobile navigation drawer, the public header menus, and one access-denied state. Routes a role may not open are recorded as denied rather than audited.

| | audited states | WCAG rules violated | violation instances | failing nodes | serious/critical nodes | best-practice rules | best-practice nodes |
|---|---|---|---|---|---|---|---|
| Before (candidate at ad7d7ab) | 424 | 5 | 26 | 40 | 40 | 7 | 68 |
| After (this branch on 5875835) | 428 | 1 | 1 | 1 | 1 | 2 | 12 |

## WCAG violations before the fixes

| Rule | Impact | Success criterion | instances | nodes | Where (sample) | Fix |
|---|---|---|---|---|---|---|
| `color-contrast` | serious | 1.4.3 Contrast (minimum) | 6 | 14 | anonymous /careers [page] | gold-700 → gold-800 on gold-50; red-600 → red-700 on red-50/100; white on green-600 → green-700 |
| `aria-hidden-focus` | serious | 4.1.2 Name, role, value | 10 | 10 | travelerA /travel-plan [menu:account] | the account menu is no longer a modal Radix menu, so the workspace is not marked aria-hidden while it is open |
| `svg-img-alt` | serious | 1.1.1 Non-text content | 2 | 8 | operatorAdminA /reports [page] | charts are marked decorative and their numbers published as a visually hidden list |
| `aria-prohibited-attr` | serious | 4.1.2 Name, role, value | 6 | 6 | hotelA /hotels/[id] [page] | star ratings carry role="img" (aria-label is prohibited on a bare span) |
| `scrollable-region-focusable` | serious | 2.1.1 Keyboard, 2.1.3 Keyboard (no exception) | 2 | 2 | hotelA /reports [page] | the workspace main region takes tabindex=0 while it scrolls and holds nothing focusable (committed after this state was measured; re-checked separately in axe-after-reports.json) |

## WCAG violations after the fixes

| Rule | Impact | Success criterion | instances | nodes | Where | Why it remains |
|---|---|---|---|---|---|---|
| `scrollable-region-focusable` | serious | 2.1.1 Keyboard, 2.1.3 Keyboard (no exception) | 1 | 1 | operatorStaffA /reports [page] | the workspace main region takes tabindex=0 while it scrolls and holds nothing focusable (committed after this state was measured; re-checked separately in axe-after-reports.json) |

### The re-check

The tab-stop fix for that one node was committed after the sweep had already
passed those pages, so the report pages were re-checked on their own
(`axe-after-reports.json`, log `axe-after-reports.log`):

| Identity | Route | WCAG violations | best-practice |
|---|---|---|---|
| operatorStaffA | /reports | 0 | 0 |
| hotelA | /reports | 0 | 0 |
| transportA | /reports | 0 | 0 |
| visaA | /reports | 0 | 0 |

**Final position: zero violations of the five WCAG tag sets across every audited
state.** This is an evaluation result, not a certification: axe-core tests what
can be tested automatically (roughly a third of the success criteria), which is
why the keyboard, screen-reader and responsive records sit beside it.

## Best-practice rules (not WCAG failures)

| Rule | Impact | before nodes | after nodes | Note |
|---|---|---|---|---|
| `aria-dialog-name` | serious | 10 | 0 | the notification popover now has aria-label="Notifications" |
| `empty-table-header` | minor | 3 | 0 | the action column header carries a visually hidden "Actions" |
| `heading-order` | moderate | 19 | 0 | section headings under the page <h1> lifted from <h3> to <h2> |
| `landmark-one-main` | moderate | 11 | 0 | reset-password had no <main>; the remainder are states where a modal dialog hides the page from assistive technology, which is what a modal is meant to do |
| `landmark-unique` | moderate | 2 | 0 | the inner scrollable table region is now named "… table" |
| `page-has-heading-one` | moderate | 10 | 2 | states measured while a modal dialog is open (the page behind it is hidden) |
| `region` | moderate | 13 | 10 | content outside a landmark — the reset-password card now sits in <main> |

## Coverage by identity

| Identity | role | audited states | routes audited | routes denied | dynamic routes with no instance to open |
|---|---|---|---|---|---|
| anonymous | signed out (public pages) | 27 | 24 | 0 | 0 |
| travelerA | PILGRIM | 29 | 17 | 34 | 12 |
| operatorAdminA | OPERATOR_ADMIN | 88 | 42 | 14 | 7 |
| operatorStaffA | OPERATOR_STAFF | 72 | 39 | 16 | 8 |
| financeA | FINANCE_MANAGER | 30 | 17 | 33 | 13 |
| hotelA | HOTEL_MANAGER | 47 | 21 | 29 | 12 |
| transportA | TRANSPORT_MANAGER | 57 | 27 | 26 | 10 |
| visaA | VISA_OFFICER | 47 | 24 | 28 | 11 |
| superAdmin | SUPER_ADMIN | 19 | 15 | 35 | 13 |
| travelerUnverified | PILGRIM, email not verified | 7 | 3 | 0 | 0 |
| travelerOnboarding | PILGRIM, no organization yet | 5 | 2 | 0 | 0 |

The two sweeps are not taken on identical code: the before run measured the candidate as it stood at
`ad7d7ab`, the after run measured this branch on the rebuilt candidate `5875835` (the follow-up fixers'
work landed in between). Each rule that disappeared is traceable to a specific change in this branch,
listed in the table above; the state counts differ slightly because the fixers added and removed screens.

Raw results: `axe-before.json`, `axe-after.json` (every violation with its rule, criterion, impact, route, state and node targets); console logs in `axe-before.log` and `axe-after.log`.

## After the second candidate merge

The branch was merged onto candidate `1abbfb1` (the fx3 work) after the full
sweep. The sweep was not repeated on that code; instead a spot check covered
the routes the merge touched most (`axe-spotcheck.json`: operator pilgrims,
finance, invoice detail and its tab panels, settings, and the platform tenant
list and detail) — **zero violations, zero best-practice findings** — and the
two responsive fixes were re-measured on the merged tree: platform tenants and
users report document scrollWidth 360 at 360 px width and scroll by 0, and the
landing page reports 320 at 320 px.
