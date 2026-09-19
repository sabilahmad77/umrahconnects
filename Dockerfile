# ── Umrah Connect API — production image (monorepo, NestJS + Prisma) ─────────
# Build context = repository root.
#   docker build -t umrah-connect-api:<git-sha> .
# The image never changes the database schema on start. Migrations are an
# explicit, separate step (see infrastructure/kvm/README.md):
#   docker compose run --rm api migrate
FROM node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app
# Workspace manifests first so dependency layers are cached.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY platform/api/package.json platform/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY plugins plugins
RUN pnpm install --frozen-lockfile --filter @umrah-connects/api...

COPY tsconfig.base.json ./
COPY platform/api platform/api
RUN pnpm --filter @umrah-connects/api exec prisma generate \
  && pnpm --filter @umrah-connects/api build

# ── runtime ────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini curl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 10001 app \
  && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    NODE_OPTIONS=--enable-source-maps \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

WORKDIR /app
# Application code stays owned by root and read-only for the runtime user: even without the
# read-only root filesystem of the compose stack, a compromised process cannot rewrite its own
# code or dependencies. Only the uploads directory (local storage driver) is writable.
COPY --from=build /app /app
COPY infrastructure/kvm/api-entrypoint.sh /usr/local/bin/api-entrypoint
RUN chmod 0755 /usr/local/bin/api-entrypoint \
  && mkdir -p /app/platform/api/uploads/private \
  && chown -R app:app /app/platform/api/uploads

# Commit the image was built from (scripts/deploy.sh passes it); reported by GET /api/v1/health.
# Declared last so a new release only rebuilds this metadata layer.
ARG UC_RELEASE=unknown
ENV UC_RELEASE=${UC_RELEASE}
LABEL org.opencontainers.image.title="umrah-connect-api" \
      org.opencontainers.image.revision="${UC_RELEASE}"

USER app
WORKDIR /app/platform/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/v1/health/ready" >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/api-entrypoint"]
CMD ["serve"]
