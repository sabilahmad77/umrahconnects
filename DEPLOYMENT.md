# Umrah Connect — Backend Deployment Guide

This guide deploys the **API only** (NestJS + Prisma + PostgreSQL). Frontend (Vercel)
and mobile come later and will point at the live API URL.

## Recommended free stack

| Piece    | Provider | Why | Free-tier limit |
|----------|----------|-----|-----------------|
| Database | **Neon** | Serverless Postgres, supports multi-schema, always-on, no 90-day expiry | 0.5 GB storage, autosuspends when idle (wakes on connect) |
| API host | **Render** (Web Service, Docker) | GitHub auto-deploy, env vars, logs, health checks, public HTTPS | Sleeps after 15 min idle → ~50s cold start; 750 hrs/mo |

> Alternative with **no cold-starts**: **Koyeb** free web service + the same Neon DB.
> Render is the primary recommendation because you've used it before and the
> `render.yaml` blueprint automates the setup.

## What's already prepared in this repo
- `Dockerfile` (repo root) — monorepo-aware production build.
- `render.yaml` — Render Blueprint (Docker web service, health check, env vars).
- `GET /api/v1/health` — liveness + DB check · `GET /api/v1/health/ready` — readiness.
- CORS reads `CORS_ORIGINS` (comma-separated; `*` allowed for testing).
- Server binds `0.0.0.0` and honors `PORT`.
- Prisma `binaryTargets` include the Linux/Debian engine for the container.

## One-time database provisioning (run once against Neon)
From the repo root, with the Neon URL exported:
```bash
export DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
cd platform/api
pnpm exec prisma db push --skip-generate   # creates all 13 schemas + tables
pnpm db:seed                                # demo tenants/users (admin@alharamain.sa / Admin@1234)
```
(The Render container also runs `prisma db push` on each start as a safety sync.)

## Required environment variables (Render dashboard)
| Var | Value | Notes |
|-----|-------|-------|
| `DATABASE_URL` | Neon connection string | **required** |
| `JWT_SECRET` | (Render generates) | required |
| `JWT_REFRESH_SECRET` | (Render generates) | required |
| `JWT_EXPIRES_IN` | `15m` | |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | |
| `NODE_ENV` | `production` | |
| `PORT` | `4000` | Render overrides automatically |
| `CORS_ORIGINS` | `*` then your Vercel URL | testing → tighten later |
| `WEB_URL` | your web URL | password-reset links |
| `KAFKA_ENABLED` | `false` | |

## Deploy steps (Render Blueprint)
1. Push this repo to GitHub (`main` branch).
2. Render → **New → Blueprint** → connect the repo → it reads `render.yaml`.
3. When prompted, paste `DATABASE_URL` (your Neon string).
4. Render builds the Dockerfile and deploys. Watch **Logs**.
5. Verify: `curl https://<service>.onrender.com/api/v1/health` → `{"status":"ok","db":"connected"}`.

## Verify key endpoints
```bash
BASE=https://<service>.onrender.com/api/v1
curl $BASE/health
curl -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@alharamain.sa","password":"Admin@1234","tenantId":"<seeded-tenant-id>"}'
curl $BASE/marketplace/listings
```

## After the backend is live
- **Web (Vercel):** set `NEXT_PUBLIC_API_URL=https://<service>.onrender.com/api/v1`
  (or keep the `/proxy-api` rewrite pointing at it). Add the Vercel domain to `CORS_ORIGINS`.
- **APK / Expo:** set `EXPO_PUBLIC_API_URL` to the Render URL and rebuild — the URL is now stable.
