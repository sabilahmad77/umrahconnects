#!/usr/bin/env bash
# Deploy a reviewed commit of main:
#   preflight → build → configuration check → backup → migrate → start → health check → tag :current
#   (or roll the API container back to :previous).
#   scripts/deploy.sh <git-sha>
# Migrations run once, as their own step, after the backup — never on container start. They are additive,
# so the previous image keeps working against the migrated schema (README: Rollback).
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh

SHA_ARG="${1:?usage: deploy.sh <git-sha>}"
REPO="$(git rev-parse --show-toplevel)"

git -C "$REPO" fetch --quiet origin
SHA="$(git -C "$REPO" rev-parse --verify --quiet "${SHA_ARG}^{commit}")" || die "unknown commit $SHA_ARG"
git -C "$REPO" merge-base --is-ancestor "$SHA" origin/main || die "$SHA is not on origin/main; only reviewed commits of main are deployed"
[ -z "$(git -C "$REPO" status --porcelain --untracked-files=no)" ] || die "tracked files in $REPO have local edits; refusing to deploy over them"
git -C "$REPO" checkout --quiet --detach "$SHA"

./scripts/preflight.sh

TAG="umrah-connect-api:$(printf '%s' "$SHA" | cut -c1-12)"
log "building $TAG"
docker build --build-arg UC_RELEASE="$SHA" -t "$TAG" "$REPO"
API_IMAGE="$TAG" compose run --rm --no-deps uc-api check-config

log "pre-deploy backup"
rc=0
./scripts/pg-backup.sh || rc=$?
case "$rc" in
  0) ;;
  3) warn "the pre-deploy backup exists locally but its off-site copy failed; continuing (the alert stays raised)" ;;
  *) die "pre-deploy backup failed; nothing was changed" ;;
esac

log "migrating"
API_IMAGE="$TAG" compose run --rm uc-api migrate

if docker image inspect umrah-connect-api:current >/dev/null 2>&1; then
  docker tag umrah-connect-api:current umrah-connect-api:previous
fi
log "starting $TAG"
if API_IMAGE="$TAG" compose up -d --wait --wait-timeout 180 &&
  compose exec -T uc-api curl -fsS -m 5 http://127.0.0.1:4000/api/v1/health/ready > /dev/null; then
  docker tag "$TAG" umrah-connect-api:current
  # Keep the five newest release images plus :current and :previous (rmi of a tag only untags a shared image).
  docker images umrah-connect-api --format '{{.Tag}}' | grep -E '^[0-9a-f]{12}$' | tail -n +6 |
    while read -r old; do docker rmi "umrah-connect-api:$old" > /dev/null 2>&1 || true; done
  log "deployed $SHA"
  exit 0
fi

warn "health check failed for $TAG"
if docker image inspect umrah-connect-api:previous >/dev/null 2>&1; then
  # :current was never moved, so it still names the previous release as well.
  API_IMAGE=umrah-connect-api:previous compose up -d --no-deps uc-api
  warn "rolled the API container back to the previous release"
fi
die "deploy of $SHA failed. Migrations are not reversed automatically — see README: Rollback"
