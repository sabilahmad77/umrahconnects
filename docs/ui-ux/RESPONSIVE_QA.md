# Current responsive acceptance

Current API 4201; frontend production build 3107. All **82 route families × four required widths = 328 minimum combinations** visited, plus role/negative/fix-retest variants. 683 recorded visits; 399 latest role/route/viewport checks. No latest document-level horizontal overflow. Data tables intentionally use labelled scroll regions; table overflow is contained.

Widths: 1440, 1280, 768 and 390, height 900. Additional 360px checks: landing, login, signup, Traveler profile, settings, onboarding and travel plan. Header, hero, sidebar/drawer controls, cards/KPIs, tables, forms, filters, long content and footer checked on their applicable routes. Operator booking dialog has separate native mobile evidence and keyboard-focus proof. Viewport override reset after QA.

The exact hero photograph is absent; current hero fallback is verified, exact-image crop/readability remains excluded until the asset is supplied. Provider detail negative fixtures and additional Operator-owned positive fixtures are differentiated in the matrix.

`route-checks.json` preserves chronological checks, including pre-fix results; `final-route-checks.json` selects latest role/route/width results. Early workspace full-page screenshots sometimes returned a blank backing surface; final workspace captures use native viewport screenshots with matching AX/DOM records. Native screenshots are viewport captures, not claims of full-page raster coverage; public full-page captures and route scroll review supplement them.

[Quality summary](acceptance-evidence/quality-summary.json) · [Final checks](acceptance-evidence/final-route-checks.json) · [360px landing](acceptance-evidence/Public-narrow-home.png).
