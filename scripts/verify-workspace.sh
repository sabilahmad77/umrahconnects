#!/usr/bin/env bash
# Umrah Connect — workspace identity check.
# Run this before changing any file. Exits non-zero when run from anywhere other
# than the canonical Umrah Connect repository.
#
# Usage:
#   scripts/verify-workspace.sh             identity, git, markers, env-file presence
#   scripts/verify-workspace.sh --runtime   also prove localhost :4100/:3000 are served from this repo
#
# Read-only: never prints environment values, never changes files or processes.
# Policy: docs/control-tower/LOCAL_WORKSPACE_POLICY.md
set -u

CANONICAL_ROOT="/Users/macbook/Projects/umrah-connects"
REMOTE_SLUG="sabilahmad77/umrahconnects"
PACKAGE_NAME="umrah-connects"
DEFAULT_BRANCH="main"
API_PORT=4100
WEB_PORT=3000
DB_PORT=5433

fail=0
warn=0
ok()   { printf '  [ OK ] %s\n' "$1"; }
bad()  { printf '  [FAIL] %s\n' "$1"; fail=1; }
note() { printf '  [WARN] %s\n' "$1"; warn=1; }

echo "Umrah Connect workspace verification"
echo "  pwd:      $(pwd)"
echo "  resolved: $(pwd -P)"

# 1. Git root
if ! root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  bad "not inside a Git repository"
  echo "WORKSPACE: WRONG — stop, do not modify files."
  exit 1
fi
root="$(cd "$root" && pwd -P)"
if [ "$root" = "$CANONICAL_ROOT" ]; then
  ok "git root is canonical ($root)"
elif [ "${UC_ALLOW_WORKTREE:-}" = "1" ] &&
     git -C "$CANONICAL_ROOT" worktree list --porcelain 2>/dev/null | grep -qx "worktree $root"; then
  note "git root is a registered worktree of the canonical repo ($root) — allowed by UC_ALLOW_WORKTREE=1"
else
  bad "git root is $root, expected $CANONICAL_ROOT"
  echo "WORKSPACE: WRONG — stop, do not modify files."
  exit 1
fi

# 2. Remote
remote="$(git -C "$root" remote get-url origin 2>/dev/null || true)"
case "$remote" in
  *"$REMOTE_SLUG" | *"$REMOTE_SLUG.git") ok "origin is $REMOTE_SLUG" ;;
  "") bad "no 'origin' remote" ;;
  *) bad "origin is not $REMOTE_SLUG" ;;
esac

# 3. Project markers
if [ -f "$root/package.json" ] && grep -q "\"name\": \"$PACKAGE_NAME\"" "$root/package.json"; then
  ok "package.json name is $PACKAGE_NAME"
else
  bad "package.json missing or not named $PACKAGE_NAME"
fi
for m in pnpm-workspace.yaml turbo.json apps/web/package.json platform/api/package.json \
         platform/api/prisma/schema.prisma .project/workspace.json docs/control-tower; do
  [ -e "$root/$m" ] && ok "marker present: $m" || bad "marker missing: $m"
done
if [ -f "$root/.project/workspace.json" ]; then
  grep -q "\"canonicalRoot\": \"$CANONICAL_ROOT\"" "$root/.project/workspace.json" &&
    ok ".project/workspace.json canonicalRoot matches" ||
    bad ".project/workspace.json canonicalRoot does not match $CANONICAL_ROOT"
fi

# 4. Branch and state (informational — never modified here)
branch="$(git -C "$root" branch --show-current)"
[ "$branch" = "$DEFAULT_BRANCH" ] && ok "branch: $branch" || note "branch: ${branch:-detached} (default is $DEFAULT_BRANCH)"
echo "  HEAD:     $(git -C "$root" rev-parse --short HEAD)"
dirty="$(git -C "$root" status --porcelain | wc -l | tr -d ' ')"
[ "$dirty" = "0" ] && ok "working tree clean" || note "working tree has $dirty changed/untracked path(s) — preserve them"
if counts="$(git -C "$root" rev-list --left-right --count HEAD...@{u} 2>/dev/null)"; then
  echo "  vs upstream: ahead $(echo "$counts" | cut -f1), behind $(echo "$counts" | cut -f2)"
fi

# 5. Environment files — presence only, values are never read
for f in platform/api/.env apps/web/.env.local; do
  [ -f "$root/$f" ] && ok "env present: $f" || bad "env missing: $f (copy from the .example and fill locally)"
done
for f in platform/api/.env.local apps/web/.env.development.local; do
  [ -f "$root/$f" ] && ok "local port override present: $f" || note "local port override missing: $f (see LOCAL_WORKSPACE_POLICY.md)"
done
for f in platform/api/.env apps/web/.env.local platform/api/.env.local apps/web/.env.development.local; do
  if git -C "$root" ls-files --error-unmatch "$f" >/dev/null 2>&1; then bad "SECRET RISK: $f is tracked by Git"; fi
done

# 6. Optional runtime provenance
if [ "${1:-}" = "--runtime" ]; then
  for port in $API_PORT $WEB_PORT; do
    pid="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1)"
    if [ -z "$pid" ]; then note "nothing listening on :$port"; continue; fi
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
    case "$cwd" in
      "$root" | "$root"/*) ok ":$port PID $pid cwd $cwd" ;;
      *) bad ":$port PID $pid is served from $cwd (not this repo)" ;;
    esac
  done
  if command -v pg_isready >/dev/null 2>&1 && pg_isready -q -h 127.0.0.1 -p "$DB_PORT"; then
    ok "PostgreSQL accepting connections on 127.0.0.1:$DB_PORT"
  else
    note "PostgreSQL not reachable on 127.0.0.1:$DB_PORT"
  fi
  code="$(curl -s -m5 -o /dev/null -w '%{http_code}' "http://localhost:$API_PORT/api/v1/health" || true)"
  [ "$code" = "200" ] && ok "API health 200" || note "API health returned ${code:-no response}"
fi

if [ "$fail" -ne 0 ]; then
  echo "WORKSPACE: WRONG OR BROKEN — stop, do not modify files."
  exit 1
fi
[ "$warn" -ne 0 ] && echo "WORKSPACE: VERIFIED (with warnings)" || echo "WORKSPACE: VERIFIED"
exit 0
