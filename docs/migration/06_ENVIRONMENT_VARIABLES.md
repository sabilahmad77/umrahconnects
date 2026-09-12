# 06 — Environment Variables

**No secret values appear in this document.** Names, purposes and sources only.

Three templates are committed:

| Template | Copy to | Scope |
|---|---|---|
| `platform/api/.env.example` | `platform/api/.env` | Backend + Prisma. **Required.** |
| `apps/web/.env.local.example` | `apps/web/.env.local` | Frontend. **Required.** |
| `.env.example` (root) | *(not copied)* | Aspirational superset — reference only, see the bottom of this file. |

Legend — **NEW MAC ACTION**: `copy template` = the committed default is correct
as-is · `set locally` = may need a machine-specific value · `human` = obtain
from a provider account.

## Backend — `platform/api/.env`

| Name | Purpose | Required | Secret | Source | Used in | New Mac action |
|---|---|---|---|---|---|---|
| `NODE_ENV` | Runtime mode | Required | No | template | Nest, storage warnings | copy template (`development`) |
| `PORT` | API listen port | Required | No | template | `main.ts` | copy template (`4000`) |
| `DATABASE_URL` | Postgres connection | **Required** | No (local has no password) | template | `schema.prisma`, Prisma CLI | **set locally** — confirm port 5432 vs 5433 |
| `JWT_SECRET` | Signs access tokens | **Required** | Yes in prod | template (dev value) | `auth.module.ts`, `jwt.strategy.ts` via **`getOrThrow`** | copy template — **API will not boot without it** |
| `JWT_REFRESH_SECRET` | Signs refresh tokens | **Required** | Yes in prod | template (dev value) | auth service | copy template |
| `JWT_EXPIRES_IN` | Access token TTL | Required | No | template | auth | copy template (`15m`) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | Required | No | template | auth | copy template (`7d`) |
| `APP_URL` | Web app origin | Required | No | template | CORS fallback | copy template |
| `CORS_ORIGINS` | Comma-separated allow-list | Optional | No | template | `main.ts` (falls back to `APP_URL`) | copy template |
| `WEB_URL` | Base for emailed links | Optional | No | template | `auth.service.ts` (falls back to localhost:3000) | copy template |
| `THROTTLE_SHORT_LIMIT` | Rate limit | Optional | No | template | throttler | copy template |
| `THROTTLE_MEDIUM_LIMIT` | Rate limit | Optional | No | template | throttler | copy template |
| `THROTTLE_LONG_LIMIT` | Rate limit | Optional | No | template | throttler | copy template |
| `REDIS_URL` | Cache/queue | Optional | No | template | declared; not required locally | copy template |
| `KAFKA_ENABLED` | Event bus toggle | Optional | No | template | `events.service.ts` | copy template (**`false`**) |
| `KAFKA_BROKERS` | Broker list | Optional | No | template | events | copy template |
| `KAFKA_CLIENT_ID` | Kafka client id | Optional | No | template | events | copy template |
| `KAFKA_GROUP_ID` | Kafka group id | Optional | No | template | events | copy template |

### Object storage

| Name | Purpose | Required | Secret | Source | Used in | New Mac action |
|---|---|---|---|---|---|---|
| `STORAGE_DRIVER` | `local` \| `s3` \| `cloudinary` | Optional (defaults `local`) | No | template | `storage.service.ts` | copy template (`local`) |
| `S3_BUCKET` | Bucket name | Only if `s3` | No | AWS | `storage.service.ts` | **human** |
| `S3_REGION` | Bucket region | Only if `s3` | No | AWS | `storage.service.ts` | **human** |
| `S3_ACCESS_KEY_ID` | AWS key id | Only if `s3` | **Yes** | AWS | `storage.service.ts` | **human** |
| `S3_SECRET_ACCESS_KEY` | AWS secret | Only if `s3` | **Yes** | AWS | `storage.service.ts` | **human** |
| `CLOUDINARY_CLOUD_NAME` | Cloud name | Only if `cloudinary` | No | Cloudinary | `storage.service.ts` | **human** |
| `CLOUDINARY_API_KEY` | API key | Only if `cloudinary` | **Yes** | Cloudinary | `storage.service.ts` | **human** |
| `CLOUDINARY_API_SECRET` | API secret | Only if `cloudinary` | **Yes** | Cloudinary | `storage.service.ts` | **human** |

With `local`, uploads land on the server disk. That is correct for development
and **wrong for production** — the container filesystem is wiped on redeploy.
The API logs a warning when `local` is used with `NODE_ENV=production`, and the
document register surfaces it in the UI.

### Payments

| Name | Purpose | Required | Secret | Source | Used in | New Mac action |
|---|---|---|---|---|---|---|
| `PAYMENT_PROVIDER` | `sandbox` \| `stripe` | Optional (defaults `sandbox`) | No | template | `payments.service.ts` | copy template (`sandbox`) |
| `SANDBOX_WEBHOOK_SECRET` | HMAC key for sandbox webhooks | Optional (has dev default) | Dev only | template | `sandbox.provider.ts` | copy template |
| `STRIPE_SECRET_KEY` | Stripe API key | Only if `stripe` | **Yes** | Stripe | `stripe.provider.ts` | **human** |
| `STRIPE_WEBHOOK_SECRET` | Stripe signature key | Only if `stripe` | **Yes** | Stripe | `stripe.provider.ts` | **human** |

The sandbox provider is a **complete working gateway** needing no external
account. Selecting `stripe` without keys returns **503 naming the missing
variables** — deliberately, so a missing configuration can never look like a
successful payment.

## Frontend — `apps/web/.env.local`

| Name | Purpose | Required | Secret | Source | Used in | New Mac action |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | API base path | **Required** | No | template | `apps/web/lib/api.ts` | copy template — **keep `/proxy-api`** |
| `NEXT_PUBLIC_APP_URL` | Public app URL | Required | No | template | app metadata | copy template |
| `NEXTAUTH_SECRET` | NextAuth secret | Required | Yes in prod | template (dev value) | auth config | copy template |
| `NEXTAUTH_URL` | NextAuth base URL | Required | No | template | auth config | copy template |

`NEXT_PUBLIC_API_URL` must stay the **relative** `/proxy-api`. It is a
`next.config` rewrite to the API, which keeps web and API same-origin on any
host or tunnel with no rebuild. Replacing it with an absolute URL breaks that.

## Production

Production values are held in the **Vercel** (frontend) and **Render**
(backend) dashboards and are not present in this repository or on the old Mac.
`render.yaml` generates `JWT_SECRET` and `JWT_REFRESH_SECRET` on the platform
(`generateValue: true`) and marks `DATABASE_URL` as `sync: false`, meaning it is
pasted in by hand.

## About the root `.env.example`

The root template lists many providers — SendGrid/SMTP, Twilio, 360dialog,
HyperPay, Midtrans, Tabby, Tamara, AWS KMS, MinIO, Datadog, Sentry, OTEL,
Wafeq/ZATCA, and the Nusuk / SISKOPATUH / NAHCON regulator APIs.

**No code reads any of them today.** They are forward-looking placeholders. It
has been left intact rather than trimmed, because deleting names that a future
integration will re-add is churn without benefit — but do not read that file as
a description of what the system currently does. The authoritative list of what
the backend actually consumes is `platform/api/.env.example`, which was verified
against the source during this migration (`CORS_ORIGINS` and `WEB_URL` were
missing and have been added).
