# 03 — Deployment and Services

Live checks in this document were run on **2026-09-12** from the old Mac.
Anything that could not be proven from repository evidence or a live request is
marked **NOT CONFIRMED** rather than guessed.

## Frontend

| | |
|---|---|
| Provider | **Vercel** |
| Live URL | **https://umrahconnect.io** |
| Live check (2026-09-12) | **HTTP 200 — up** |
| Deploys from | `main`, automatically on push |
| Project name in Vercel | **NOT CONFIRMED** — no `vercel.json` in the repo; the project is configured in the Vercel dashboard |
| Evidence | `README.md`, `docs/HANDOFF.md`, live request |

## Backend

| | |
|---|---|
| Provider | **Render** |
| Live URL | **https://umrah-connect-api.onrender.com/api/v1** |
| Service ID | `srv-d94peplckfvc73adlr9g` (from `docs/HANDOFF.md`) |
| Blueprint | `render.yaml` — `name: umrah-connect-api`, `runtime: docker`, `plan: free`, `region: oregon`, `branch: main`, `healthCheckPath: /api/v1/health`, `autoDeploy: true` |
| Container | root `Dockerfile`. Start command runs `prisma db push --skip-generate --accept-data-loss` **and then** `node dist/src/main.js`, so schema changes apply on deploy with no migrations directory. |
| Live check (2026-09-12) | ⚠️ **HTTP 000 — no response after 45 s** |

### ⚠️ Known outage — carried into the migration

The Render API has been unreachable since 2026-08-22. DNS, TLS and HTTP/2 all
negotiate successfully; the request is sent and the service never replies. That
is well beyond the documented ~50 s free-tier cold start.

This was investigated and **ruled out as a code problem**:

- the exact production upgrade path was replayed locally (previous committed
  schema pushed to a scratch database, then
  `prisma db push --skip-generate --accept-data-loss` exactly as the container
  runs it) → clean sync in 147 ms;
- the built artifact was booted locally (`node dist/src/main.js`) against that
  upgraded database → healthy in 2 s, with all routes mapped.

**Action required by a human:** open the Render dashboard for
`srv-d94peplckfvc73adlr9g` and check for a failed deploy, a suspended free
instance, or exhausted free-tier hours. This is **not** a migration blocker —
local development does not depend on it.

## Domain

| Host | State |
|---|---|
| `umrahconnect.io` | Live, HTTP 200 (Vercel) |
| `www.umrahconnect.io` | **No DNS record** — HTTP 000. Long-standing known gap; needs a CNAME added in the domain settings (human/DNS access). |
| `umrah-connect-api.onrender.com` | API host; currently not responding (above) |
| Registrar / DNS provider | **NOT CONFIRMED** — not discoverable from the repository |

## Database

| | |
|---|---|
| Engine | PostgreSQL |
| Local version | 15 |
| ORM | Prisma 5.22, **13-schema multiSchema** |
| Migration mechanism | **`prisma db push`** — there is deliberately **no** migrations directory |
| Production instance | Render Postgres `dpg-d94o1dtckfvc73abpon0-a` (from `docs/HANDOFF.md`). `render.yaml` sets `DATABASE_URL` with `sync: false`, i.e. pasted into the dashboard by hand. |
| Note | `render.yaml`'s comment says the database is on Neon while `HANDOFF.md` names a Render Postgres id. **NOT CONFIRMED** which is current — read the actual `DATABASE_URL` in the Render dashboard. Local development is unaffected. |
| Local requirement | Yes — a local PostgreSQL 15 is required for development |

## Integrations

Two things are true at once and it matters: the **root `.env.example` is an
aspirational superset** listing many providers, while only a subset is actually
referenced by code today. Verified by grepping `platform/api/src`.

### Wired in code

| Service | Purpose | Variables | Credentials needed? | State |
|---|---|---|---|---|
| **Local disk storage** | Visa documents, media | `STORAGE_DRIVER=local` | No | **Active default.** Ephemeral — wiped on every deploy. |
| **AWS S3** | Durable object storage | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | **Yes — human** | Driver selectable; SDK not yet enabled. Reports missing keys and answers 503 rather than failing silently. |
| **Cloudinary** | Durable object storage (alternative) | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | **Yes — human** | As above |
| **Sandbox payments** | Full local gateway | `PAYMENT_PROVIDER=sandbox`, `SANDBOX_WEBHOOK_SECRET` | No | **Active default.** Complete gateway — intents, capture, declines, refunds, HMAC-signed webhooks. Moves no real money. |
| **Stripe** | Live/sandbox card payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **Yes — human** | Adapter present, SDK not enabled. Reports its own missing config; API returns 503 naming the exact variables. |
| **Kafka** | Event bus | `KAFKA_ENABLED`, `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`, `KAFKA_GROUP_ID` | No | **Disabled** (`false`) |
| **Redis** | Cache/queue | `REDIS_URL` | No | Declared; not required locally |

### Declared in the root template but NOT wired in code

Present in `.env.example` as forward-looking placeholders only — no code reads
them today: SendGrid/SMTP, Twilio & 360dialog (WhatsApp/SMS), HyperPay,
Midtrans, Tabby, Tamara, AWS KMS, MinIO, Datadog, Sentry, OpenTelemetry, Wafeq
/ ZATCA, and the regulator APIs (Nusuk, SISKOPATUH, NAHCON).

**Regulator integrations must continue to be shown as PLANNED in the UI.** They
are not live, and a previous audit item (BP-04) specifically exists to keep the
product from overclaiming this. Do not change those labels.

## CI/CD

**There is none.** No `.github/` directory exists.

`.gitignore` previously contained `.github/workflows/` with the note “requires a
workflow-scoped token; re-add later”. That rule has been **removed** during this
migration: no workflow files existed (so nothing was hidden), the current `gh`
token *does* carry the `workflow` scope, and leaving the rule in place risked
silently dropping CI configuration on a future machine move.

Deployment today is simply: **push to `main` → Vercel and Render auto-deploy.**

## Accounts

| | |
|---|---|
| GitHub | `sabilahmad77` — authenticated via `gh` (keyring), scopes `gist, read:org, repo, workflow` |
| Vercel | **NOT CONFIRMED** from the repository — sign in to the dashboard |
| Render | **NOT CONFIRMED** from the repository — sign in to the dashboard |

No passwords, tokens or secret values appear anywhere in this repository.
