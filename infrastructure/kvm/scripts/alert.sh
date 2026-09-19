#!/usr/bin/env bash
# Notification hook:  scripts/alert.sh "<subject>" ["<details>"]
# Always writes to stderr and the system journal (tag umrah-connect-alert). When ALERT_WEBHOOK_URL is set
# (.env.production or the environment) it also POSTs the message:
#   ALERT_WEBHOOK_FORMAT=json (default)  {"text": "…"} — Slack, Mattermost, Google Chat, Teams, Discord's /slack URL
#   ALERT_WEBHOOK_FORMAT=text            the plain message — ntfy and similar
# Called by scripts/healthcheck.sh and by systemd (umrah-alert@<unit>.service) when a backup or cleanup
# unit fails. The webhook URL is a secret and is never printed.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
. scripts/lib.sh

SUBJECT="${1:?usage: alert.sh <subject> [details]}"
DETAILS="${2:-}"
MSG="[umrah-connect@$(hostname | cut -d. -f1)] $SUBJECT"
[ -n "$DETAILS" ] && MSG="$MSG
$DETAILS"

printf '%s\n' "$MSG" >&2
if command -v logger > /dev/null 2>&1; then logger -t umrah-connect-alert -p user.err -- "$SUBJECT" || true; fi

URL="${ALERT_WEBHOOK_URL:-$(env_get ALERT_WEBHOOK_URL)}"
[ -n "$URL" ] || exit 0
FORMAT="${ALERT_WEBHOOK_FORMAT:-$(env_get ALERT_WEBHOOK_FORMAT)}"
case "${FORMAT:-json}" in
  text)
    body="$MSG"
    type="text/plain; charset=utf-8"
    ;;
  json)
    # JSON string escaping for backslash, quote, tab and newline (the only control characters used here).
    esc="$(printf '%s' "$MSG" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e "s/$(printf '\t')/\\\\t/g" | awk 'NR > 1 { printf "\\n" } { printf "%s", $0 }')"
    body="{\"text\":\"$esc\"}"
    type="application/json"
    ;;
  *)
    warn "ALERT_WEBHOOK_FORMAT must be json or text"
    exit 1
    ;;
esac
if ! curl -fsS -m 15 -o /dev/null -H "Content-Type: $type" --data-binary "$body" "$URL" 2> /dev/null; then
  warn "the alert webhook did not accept the message (URL not shown); the alert is in the journal"
  exit 1
fi
