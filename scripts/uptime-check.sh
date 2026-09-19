#!/usr/bin/env bash
# Provider-neutral uptime probe for Umrah Connect (I08). Used by .github/workflows/uptime.yml and by
# infrastructure/kvm/scripts/healthcheck.sh on the server. Prints one line per check; exits 0 only when
# every check passes. Needs curl, openssl and perl (all present on Ubuntu and macOS).
#   UPTIME_API_URL        API origin   (default https://api.umrahconnect.io; empty skips the API checks)
#   UPTIME_WEB_URL        web origin   (default https://umrahconnect.io;     empty skips the web checks)
#   UPTIME_CONNECT_TO     connect to this address for the API host instead of resolving DNS
#                         (the server checks its own HTTPS edge with 127.0.0.1)
#   UPTIME_CACERT         extra CA bundle (private CA in rehearsals)
#   UPTIME_TIMEOUT=15     seconds per request     UPTIME_ATTEMPTS=3   tries per check, 5 s apart
#   UPTIME_TLS_MIN_DAYS=14  certificates must stay valid at least this many days
set -uo pipefail

API="${UPTIME_API_URL-https://api.umrahconnect.io}"
WEB="${UPTIME_WEB_URL-https://umrahconnect.io}"
API="${API%/}"
WEB="${WEB%/}"
CONNECT_TO="${UPTIME_CONNECT_TO:-}"
TIMEOUT="${UPTIME_TIMEOUT:-15}"
ATTEMPTS="${UPTIME_ATTEMPTS:-3}"
RETRY_DELAY="${UPTIME_RETRY_DELAY:-5}"
TLS_MIN_DAYS="${UPTIME_TLS_MIN_DAYS:-14}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
failures=0
checks=0
report() { printf '%-4s %-24s %s\n' "$1" "$2" "$3"; }
with_timeout() { perl -e 'alarm shift; exec @ARGV or exit 127' "$@"; }
host_of() { printf '%s' "$1" | sed -E 's#^[a-z]+://([^/:]+).*#\1#'; }
port_of() {
  local p
  p="$(printf '%s' "$1" | sed -nE 's#^[a-z]+://[^/:]+:([0-9]+).*#\1#p')"
  case "$1" in https://*) echo "${p:-443}" ;; *) echo "${p:-80}" ;; esac
}

# probe <name> <url> <body pattern or ""> [extra curl arguments…]
probe() {
  local name="$1" url="$2" want="$3" code detail i
  shift 3
  checks=$((checks + 1))
  for i in $(seq 1 "$ATTEMPTS"); do
    code="$(curl -sS -o "$TMP/body" -D "$TMP/headers" -w '%{http_code}' --max-time "$TIMEOUT" \
      ${UPTIME_CACERT:+--cacert "$UPTIME_CACERT"} "$@" "$url" 2> "$TMP/err" || true)"
    if [ "$code" = "200" ]; then
      # Render's router adds rndr-id / x-render-* headers. An answer through Render means the cutover is
      # incomplete (docs/control-tower/RENDER_RETIREMENT.md), so it never counts as healthy.
      if grep -Eiq '^(rndr-id|x-render-[a-z-]+):' "$TMP/headers"; then
        detail="answered via Render (rndr-id/x-render-* headers) — Render is retired"
      elif [ -n "$want" ] && ! grep -Eq "$want" "$TMP/body"; then
        detail="HTTP 200 without the expected body"
      else
        report PASS "$name" "HTTP 200 $url"
        return 0
      fi
    else
      detail="HTTP ${code:-000} $(tr '\n' ' ' < "$TMP/err" | cut -c1-160)"
    fi
    [ "$i" -lt "$ATTEMPTS" ] && sleep "$RETRY_DELAY"
  done
  report FAIL "$name" "$detail ($url)"
  failures=$((failures + 1))
  return 1
}

# tls <name> <url> [connect address]
tls() {
  local name="$1" url="$2" addr host port pem expiry
  case "$url" in https://*) ;; *)
    report SKIP "$name" "not an https URL"
    return 0
    ;;
  esac
  checks=$((checks + 1))
  host="$(host_of "$url")"
  port="$(port_of "$url")"
  addr="${3:-$host}"
  pem="$(with_timeout "$TIMEOUT" openssl s_client -connect "$addr:$port" -servername "$host" < /dev/null 2> /dev/null |
    sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p')"
  if [ -z "$pem" ]; then
    report FAIL "$name" "no certificate from $host ($addr:$port)"
    failures=$((failures + 1))
    return 1
  fi
  expiry="$(printf '%s\n' "$pem" | openssl x509 -noout -enddate | cut -d= -f2)"
  if printf '%s\n' "$pem" | openssl x509 -noout -checkend $((TLS_MIN_DAYS * 86400)) > /dev/null; then
    report PASS "$name" "$host certificate valid until $expiry"
  else
    report FAIL "$name" "$host certificate expires within $TLS_MIN_DAYS days ($expiry)"
    failures=$((failures + 1))
    return 1
  fi
}

READY='"status"[[:space:]]*:[[:space:]]*"ready"'
if [ -n "$API" ]; then
  resolve=()
  [ -n "$CONNECT_TO" ] && resolve=(--resolve "$(host_of "$API"):$(port_of "$API"):$CONNECT_TO")
  probe api-ready "$API/api/v1/health/ready" "$READY" ${resolve[@]+"${resolve[@]}"}
  if probe api-live "$API/api/v1/health" '"db"[[:space:]]*:[[:space:]]*"connected"' ${resolve[@]+"${resolve[@]}"}; then
    release="$(sed -nE 's/.*"release"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' "$TMP/body")"
    [ -n "$release" ] && report INFO api-release "$release"
  fi
  tls api-tls "$API" "$CONNECT_TO"
fi
if [ -n "$WEB" ]; then
  probe web-home "$WEB/" "" -L --max-redirs 3
  # The browser's only path to the API: Vercel's /proxy-api rewrite. This is what broke when Render died.
  probe web-proxy-api "$WEB/proxy-api/health/ready" "$READY"
  tls web-tls "$WEB"
fi

if [ "$failures" -gt 0 ]; then
  printf 'uptime-check: %d of %d checks FAILED\n' "$failures" "$checks"
  exit 1
fi
printf 'uptime-check: all %d checks passed\n' "$checks"
