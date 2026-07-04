# ── Umrah Connect API — production container (monorepo, NestJS + Prisma) ──
# Build context = repo root. Used by Render (env: docker) and any Docker host.
FROM node:20-slim AS build

# openssl is required by Prisma; build tools for any native deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Copy the whole monorepo (workspace globs need all package.json files present)
COPY . .

# Install all workspace deps (frozen lockfile for reproducible builds)
RUN pnpm install --frozen-lockfile

# Generate Prisma client (produces the debian engine inside the container) + build API
RUN pnpm --filter @umrah-connects/api exec prisma generate
RUN pnpm --filter @umrah-connects/api build

ENV NODE_ENV=production
# Render/hosts inject PORT; default to 4000 locally
ENV PORT=4000
EXPOSE 4000

# On start: sync schema to the database (idempotent), then launch the API.
# Seeding demo data is a separate one-time step (see DEPLOYMENT.md), not run here.
WORKDIR /app/platform/api
# nest build preserves the src/ dir (prisma/ is in the compile include) → dist/src/main.js
CMD ["sh", "-c", "pnpm exec prisma db push --skip-generate --accept-data-loss && node dist/src/main.js"]
