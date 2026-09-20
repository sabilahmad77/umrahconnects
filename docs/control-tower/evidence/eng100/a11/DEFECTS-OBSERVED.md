# Defects observed while auditing (outside this branch's scope)

## 1. The running candidate serves HTML that references chunks it then refuses (:3300)

Reproduced twice, 2026-09-21 ~01:40, on the coordinator's candidate stack:

```
GET http://localhost:3300/_next/static/chunks/6335-5f6ec537741d0f7b.js
→ 400 Bad Request, text/html (Next's own "400: Bad Request" page)
```

The same happens for `app/(dashboard)/dashboard/page-4eb627af3d291bd7.js`,
`app/help/page-…js` and `app/solutions/page-…js` — all of them referenced by the
HTML the same server had just served. The browser therefore cannot execute the
dashboard's page chunk and the operator's `/dashboard` renders the error state
("This page could not load"), with **no failing API call** behind it.

* Signed in as the QA operator administrator; a fresh browser context each time.
* The identical code on this branch's own stack (`:3411`, development server,
  `umrah_eng100_a11`) renders the dashboard normally ("Welcome back, Yasmin…"),
  so this is the built candidate's asset state, not the application code.
* Likely cause: the `.next` build directory changed after the running server
  loaded its manifests (rebuild/restart overlap). A clean rebuild and restart
  should settle it — worth confirming before anyone reads A10's browser QA
  failures on the affected routes as application defects.

## 2. Firefox announces an untouched required field as invalid

With Orca, tabbing into the sign-in email field is spoken as
"Email address entry required. invalid entry." before anything is typed.
That is Firefox exposing native constraint validation (`:invalid` on a required
empty field), not an authored error state, and it happens on any site that marks
a field `required`. Recorded because it is audible noise for screen-reader users,
not because the markup is wrong.

## 3. Orca does not voice the account menu item by item

The menu opens and is announced ("menu … Profile"), and Escape returns focus to
the trigger, but arrowing between the items is silent. Orca's log shows the
link-based menu items being removed and re-added on every move, so it treats each
as a replacement. Not reproduced on other screen readers — NVDA, JAWS and
VoiceOver were not available in this environment.
