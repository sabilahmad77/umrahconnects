#!/usr/bin/env bash
# Deploy a reviewed commit: build → backup → migrate → start → health-check → keep or roll back.
#   scripts/deploy.sh <git-sha>
set -euo pipefail
cd "$(dirname "$0")/.."
SHA="${1:?usage: deploy.sh <git-sha>}"
REPO="$(git rev-parse --show-toplevel)"
COMPOSE="docker compose --env-file .env.production"

git -C "$REPO" fetch --quiet origin
git -C "$REPO" checkout --quiet --detach "$SHA"
PREVIOUS="$(docker image inspect umrah-connect-api:current --format '{{.Id}}' 2>/dev/null || true)"

docker build -t "umrah-connect-api:$SHA" "$REPO"
./scripts/pg-backup.sh

API_IMAGE="umrah-connect-api:$SHA" $COMPOSE run --rm api migrate
API_IMAGE="umrah-connect-api:$SHA" $COMPOSE up -d api caddy

for i in $(seq 1 30); do
  if $COMPOSE exec -T api curl -fsS http://127.0.0.1:4000/api/v1/health/ready >/dev/null 2>&1; then
    docker tag "umrah-connect-api:$SHA" umrah-connect-api:current
    [ -n "$PREVIOUS" ] && docker tag "$PREVIOUS" umrah-connect-api:previous
    echo "deployed $SHA"
    exit 0
  fi
  sleep 2
done

echo "health check failed — rolling back the API container" >&2
if [ -n "$PREVIOUS" ]; then
  API_IMAGE="$PREVIOUS" $COMPOSE up -d api
fi
echo "NOTE: migrations are not reversed automatically. Follow infrastructure/kvm/README.md § Rollback." >&2
exit 1
