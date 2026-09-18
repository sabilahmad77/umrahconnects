# A02 evidence — auth, Google Sign-In, email verification, account settings, preferences

Worker A02, Engineering 100 loop, branch `eng100/a02`. Requirements W13 (XT-R06),
W14 (XT-R07), W20 (XT-R13), P07 (XT-005).

## What is here

| File | What it is |
|---|---|
| `results.json` | Sanitized browser-check results: route, identity, action, expected, actual, request outcome, persistence check. No tokens, cookies or passwords. |
| `NN-*.png` | Screenshots of key states (test accounts on a local dev database only). |
| `browser-checks.cjs` | The playwright-core script that produced them (Chrome headless, one context per identity, sign-in always through the real `/login` form). |

## Honesty labels

- **Google** in these checks is **stubbed Google — not a real Google login**:
  `platform/api/test/support/google-oidc-stub.mjs`, a local OpenID provider on
  `127.0.0.1:4482`. The API talks to it through the same google-auth-library
  code as for Google (PKCE S256 verified by the provider, ID-token RS256
  signature, audience, issuer, expiry and nonce verified by the API). The API
  honours `GOOGLE_OIDC_STUB_URL` only outside production and only for a bare
  loopback http origin (unit-tested). **Real Google verification (A11) remains
  UNVERIFIED** — no Google OAuth client exists on this machine.
- **Mail** is `MAIL_DRIVER=log`: verification and reset links were read from the
  API's local log (local mail capture), **not SMTP delivery. A13 remains UNVERIFIED.**
- The access-token lifetime was shortened to **120 s** for this run (production:
  15 min) so a real server-side expiry and silent refresh happen during the check.
- One test-setup step touches the database directly and is labelled in the
  results: the expired verification link is aged by moving `expires_at` into the
  past instead of waiting 24 hours; the preferences account is reset to its
  defaults first; the two-workspace account is created (or its password reset)
  by the script. Accounts the script creates get random passwords each run.

## Google redirect URI — verified values

The API sets its signed, httpOnly state cookie (`uc_g_state`, 10 min) on the
response to `GET /proxy-api/auth/google/start`, which the browser receives
**through the web origin's `/proxy-api` rewrite** (checked: the 302 and the
`Set-Cookie` pass through Next unchanged). The callback must therefore arrive on
the same web origin or the cookie is not sent and the flow fails with
`google_state`. So:

- `GOOGLE_REDIRECT_URI` = `WEB_URL` + `/proxy-api/auth/google/callback`, registered
  verbatim as an Authorized redirect URI of the Google OAuth (Web) client.
- local: `http://localhost:3000/proxy-api/auth/google/callback` (this run: `:3402`)
- production: `https://umrahconnect.io/proxy-api/auth/google/callback`
- https is mandatory in production (`bootstrap/env.validation.ts`, already the
  case — it only runs its checks when `NODE_ENV=production`; unit test in
  `src/modules/auth/google-config.spec.ts`); `http://localhost` works locally.

## Reproduce

```
# stub provider (test values, not credentials)
cd platform/api && STUB_PORT=4482 STUB_CLIENT_ID=a02-stub-client.apps.googleusercontent.test \
  STUB_CLIENT_SECRET=a02-stub-secret-not-real \
  STUB_REDIRECT_URIS=http://localhost:3402/proxy-api/auth/google/callback node test/support/google-oidc-stub.mjs
# API
GOOGLE_CLIENT_ID=a02-stub-client.apps.googleusercontent.test GOOGLE_CLIENT_SECRET=a02-stub-secret-not-real \
  GOOGLE_REDIRECT_URI=http://localhost:3402/proxy-api/auth/google/callback \
  GOOGLE_OIDC_STUB_URL=http://127.0.0.1:4482 JWT_EXPIRES_IN=120s pnpm dev > api.log
# web
cd apps/web && npx next dev -p 3402
# checks (SEEDED_PASSWORD = the documented demo-account password)
API_LOG=/path/to/api.log SEEDED_PASSWORD=… node docs/control-tower/evidence/eng100/a02/browser-checks.cjs
```
