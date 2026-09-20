# A10 — independent functional browser QA across every role

Independent black-box testing of the integrated candidate through a real browser. A10 implemented none
of this code. Full per-check evidence: `functional-matrix.json` (same folder); screenshots in `screens/`.

## How this was tested

| | |
|---|---|
| Web / API | `http://localhost:3300` (production build, `next start`) · `http://localhost:4300` (`/api/v1`) |
| Browser | Google Chrome **153.0.8010.52**, headless, driven by `playwright-core` 1.49.1 |
| Revisions covered | `79ff382` (first sweeps) → `5875835` (rebuilt candidate, re-verification batch). Each check row carries the revision read at the moment it ran. |
| Identities | the 15 local QA fixtures, plus 4 accounts A10 registered itself for destructive auth work |
| Sessions | every session created through the real `/login` form. No token was injected, no storage was edited. |
| API probes | same-origin `fetch` issued **from inside the signed-in page**, using that page's own session exactly as the app's API client does. No password, cookie, token or storage state was printed or saved. |
| Scripts | `audit/eng100/a10/*.js` (harness `lib.js`, one script per area, `merge.js` builds this evidence) |

Mail-dependent journeys (email confirmation, password reset, trip invitation) were completed by running
**A10's own second API instance** on port 4310 against the same database with `MAIL_DRIVER=log`, reading the
`[dev-mail]` links from that process's own log, and finishing each journey in the browser on :3300. That
instance was stopped afterwards; `:4300` and `:3300` were never touched.

## Coverage

| | |
|---|---|
| Routes | **87 / 87** route templates in `apps/web/app/**/page.tsx` (63 workspace + 24 public) |
| Role × route access decisions | 1,437 denied-state checks + 564 positive renders, every fixture identity against every workspace route |
| Checks recorded | **3,329** — **3,262 PASS**, **39 FAIL**, **28 UNTESTED** |
| Open failures | **17** rows = **3 distinct defects** (the other 22 failing rows are fixed and re-verified at `5875835`) |
| Screenshots | 177 files (158 referenced from check rows; every failure plus sampled passes) |
| Cross-cutting | console errors, failed requests and request-loop watch on every page visit (1,138 health checks) |

Check kinds: 1,437 permission-denied · 564 positive · 388 network · 387 console · 364 loop · 56 required-field/invalid-input ·
47 cross-tenant · 30 double-submit · 28 persistence-after-refresh · 22 shared-record · 4 fresh-login · 1 empty · 1 error-state.

## Journeys

Passed **45 / 47**. Two could not be completed for stated environment reasons (below).

**Auth & account** — register (valid, required-field, weak password, duplicate e-mail, role interest) · confirm
e-mail via the emailed link, link reuse refused · sign in (all 15 identities land on the right workspace home),
unknown e-mail and wrong password give the same generic message, empty form blocked client-side · **workspace
picker** (one e-mail opening two workspaces; both choices open the right organization) · `returnTo` honoured,
off-site `returnTo` ignored · forgot password (neutral answer for registered and unregistered alike) · password
reset via the emailed link, spent link refused, old password refused · change password (5 invalid paths, then
success revoking every session) · sign out, sign out everywhere (cancel and confirm) · preferences saved and
persisted across refresh and fresh login · signed-out access redirected to `/login` and the API answers 401.
Google sign-in is not configured here — the button is correctly hidden (recorded UNTESTED(provider)).

**Traveler** — marketplace browse, debounced search, no-match empty state, category filter, price sort, invalid
price range, pagination, sellers tab persisted in the URL · listing detail · booking with four validation paths ·
**sandbox checkout**: declined card leaves the booking UNPAID with "no money was taken", retry then pays, PAID
after refresh, and a paid booking offers neither Pay nor Cancel · cancel (keep, then confirm) · requests and
offers end to end: post request (4 validation paths), two providers offer, decline one, accept the other, convert
to booking, close request, offers refused on a closed request · travel plan with the linked trip after accepting
the invitation · social: post, edit, like/unlike, save/unsave, comment, reply, edit comment, delete reply, delete
post; another traveler may like and comment but is refused edit/delete in the UI and by the API · connections
(request, decline, request again, accept, remove) · messages (send, receive, reply, persisted) · notifications
(listed, mark all read, still read after refresh) · groups (own groups listed; another traveler refused).

**Operator** — pilgrims: create, list search, edit from list, edit on detail, document, archive · traveler
invitation: invalid e-mail refused, invitation sent, resend (cooldown honoured), withdraw with reason · packages ·
bookings: validation, create, status move, draft invoice from booking, cancel · finance: invoice with four
validation paths, issue, manual payment (future date refused), partial state, refund (reason validated), void,
payments list · reports (every section loads, CSV export) · operator staff limited to their grants · finance
manager scoped: creates and pays an invoice, budget plan, refused pilgrims, refused another organization's invoice.

**Hotel / Transport / Visa** — hotel: create (empty form refused), room type, room, allotment contract, check-in ·
transport: vehicle, driver, route, trip scheduled and cancelled, all empty forms refused with field-level
messages · visa: application created, workflow moved (collect documents → submit → under review → approve),
document uploaded, verified and rejected (verification refused while the document has no file), service-request
lifecycle (escalate, resolve, close, reopen), document management page.

**Super Admin & onboarding** — found an organization (name and the "this account moves" confirmation enforced),
pending organization restricted to the verification page, KYC submitted with a document, **KYC rejected with a
reason**, founder sees it and resubmits, **KYC approved**, founder signs in to the provider workspace · users:
search, status change (a suspended account is refused at sign-in with the right message), restore, force logout,
role grant and revoke · organizations: search, detail, suspend (its founder can no longer sign in) and reactivate ·
listing moderation: taken-down listing cannot be republished by its owner and leaves public search · audit log
filter and paging · platform settings, support, roles, overview · a public `/contact` inquiry reaches the console
and its status can be changed.

**Not completed (2):** Google sign-in (provider not configured — button correctly hidden); one traveler's group
membership (fixture `travelerA` belongs to no group, so the group-member view could not be exercised).

## Defects

**No P0 and no P1 were found.** Access control held everywhere it was probed: 1,437/1,437 denied-state checks
correct, 47/47 cross-tenant record probes refused (403/404) with the owning organization's record untouched, and
no JS console error or request loop on any of 387 page visits.

### Fixed during this loop and re-verified by A10 at `5875835`

| ID | Sev | Finding | Re-verification |
|---|---|---|---|
| DEF-001 | P2 | `POST /api/v1/marketplace/requests` had no capability check: financeA (finance-only) and superAdmin each got **201** and published a marketplace request although the UI denies `/requests` to both. | Now **403** "Missing required permissions: marketplace:listing:read" for both, nothing created; a traveler can still post one. Listing bookings refuse the same two roles. |
| DEF-002 | P2 | `/reports` route rule required `finance:report:read` while the API authorises `/reports/overview\|pilgrims\|bookings\|hotels\|visa\|transport` on `reporting:report:read`; visaA and operatorStaffA were denied the page and the menu entry although the API served them 200. | `/reports` now opens for both, the menu entry is back, money sections are hidden and `GET /reports/finance` is still 403 for them. |
| DEF-003 | P3 | A fast double-click submitted twice and created duplicates: pilgrim, hotel, vehicle, route, hotel allotment, social post, chat message (two identical records each), preferences (two PUTs), offer accept (two accepts), booking cancel (second answered 409). Registration, login, operator booking, invoice, package, payment, checkout and request-post were already guarded. | Single-flight guard on the shared API client: one request and one record for pilgrim, hotel, vehicle, route, social post, chat message and preferences. |

### Open at `5875835`

| ID | Sev | Finding | Exact repro | Evidence |
|---|---|---|---|---|
| DEF-004 | P3 | Every listing view by a non-owner fires `GET /api/v1/marketplace/listings/mine/:id`, which answers **404** by design ("ownership is decided by the server"). The result is a failed request plus a console error on every listing detail view, for all 12 role identities — noise that hides real failures in monitoring. | Sign in as any role, open `/marketplace/<listing id>` of a listing the organization does not own; watch the network panel. | 13 rows, `area=health`, `route=/marketplace/[id]`; screenshot `screens/reverify2-listing-detail.jpg` |
| DEF-005 | P3 | Operator staff (no `crm:pilgrim:delete`) are shown the **Archive** action on every pilgrim row; using it fails. The API is correct (403), so this is a UI capability-gating gap that offers an action that cannot work. | Sign in as `operator.staff.a@qa.umrahconnect.test`, open `/pilgrims`: the Archive button is present on each row; `DELETE /api/v1/pilgrims/:id` → 403. | 2 rows, `area=pilgrims`; screenshot `screens/reverify2-staff-pilgrims.jpg` |
| DEF-006 | P3 | `/reset-password` renders no `<main>` landmark (the other auth pages — `/login`, `/signup`, `/verify-email` — do), so "skip to content" and screen-reader landmark navigation have no target on that page. | Open `/reset-password?token=anything` signed out; `document.querySelectorAll('main').length === 0`. | 2 rows, `area=a11y` |

## Untested (28 rows) and why

- **25** — "the API refuses the same call" could not be probed for `/admin-support` and `/travel-plan/link`: those
  pages issue no data request of their own (the invitation page only acts on a token), so there is no call to refuse.
- **1** — Google sign-in: the provider is not configured in this environment and the button is correctly hidden.
- **1** — `travelerA` belongs to no group, so the group-member view could not be exercised.
- **1** — the booking detail overview tab offered no status control for the record under test, so that one transition
  was not driven from the UI (the same transition was exercised through the Next-status control on another booking).

## Reading the evidence

- `functional-matrix.json` → `meta` (environment, identities and their capabilities, counts), `routeInventory`
  (every route with the roles that were allowed, denied or redirected), `controlsSeen` (buttons and inputs found
  per role × route), `checks` (every row: route, role, action, expected, actual, request method/path/status,
  readback, screenshot, revision, timestamp, PASS/FAIL/UNTESTED + reason).
- Rows carry `reclassified` when a first-run expectation was wrong in the **harness** (not the product) and the
  recorded evidence satisfies the intent; the original result and the reason are kept. Rows superseded by a later,
  better-formed re-run are retired with `retiredReason`. Failures since fixed carry `fixedAtRevision` and
  `fixedEvidence`.

## State this worker created or changed (for other workers)

Mutations were made in the local QA database, preferring A10's own records. Fixture accounts kept their passwords;
no fixture organization was suspended or archived except A10's own.

- **Own accounts registered by A10** (never fixtures for destructive auth work): two traveler accounts
  (`a10.traveler.*`, `a10.hotelinterest.*`). The first had its password changed, its e-mail confirmed, later
  founded "A10 QA Picker Org …" and now **also has a second traveler account with the same e-mail and password**,
  which is what the workspace-picker test needed.
- **`travelerOnboarding`** is no longer a plain traveler: it founded **"A10 QA Hotel Group …"**, went through KYC
  rejection and approval, and is now an active HOTEL_MANAGER for that organization (suspended and reactivated once
  during the admin checks).
- Records created under the fixtures' organizations, all marked with an `a10-…` stamp: pilgrims (one archived),
  packages, bookings (one cancelled), invoices with payments and a refund, a budget plan, hotels with room types,
  rooms and allotments, vehicles, drivers, routes, a trip (cancelled), visa applications and a service request,
  marketplace requests (closed again), offers, social posts (deleted), a connection between travelerA and travelerB
  (removed), and one listing (taken down through moderation).
- `travelerA` is now linked to its Operator A trip (the invitation acceptance journey).
