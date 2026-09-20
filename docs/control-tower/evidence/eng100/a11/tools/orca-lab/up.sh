#!/bin/bash
# Start the lab services in the background (debug mode, fixed session bus address).
. /lab/env.sh
mkdir -p "$OUT"
dbus-daemon --session --address="$DBUS_SESSION_BUS_ADDRESS" --fork --print-pid > "$OUT/dbus.pid"
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp >"$OUT/xvfb.log" 2>&1 &
for i in $(seq 1 50); do xdpyinfo >/dev/null 2>&1 && break; sleep 0.2; done
openbox >"$OUT/openbox.log" 2>&1 &
socat TCP-LISTEN:3411,fork,reuseaddr,bind=127.0.0.1 TCP:host.docker.internal:3411 >/dev/null 2>&1 &
mkdir -p ~/.local/share/orca && cp /lab/user-settings.conf ~/.local/share/orca/user-settings.conf
sed "s/open(args.debug_file, .w.)/open(args.debug_file, 'w', buffering=1)/" /usr/bin/orca > /tmp/orca-lb
python3 /tmp/orca-lb --replace --debug-file="$OUT/orca-debug.raw.log" >"$OUT/orca-stdout.log" 2>&1 &
sleep 6
mkdir -p /tmp/ffprofile && cp /lab/firefox-user.js /tmp/ffprofile/user.js
firefox-esr --no-remote --profile /tmp/ffprofile --width 1280 --height 860 "${1:-http://localhost:3411/login}" >"$OUT/firefox.log" 2>&1 &
echo up
