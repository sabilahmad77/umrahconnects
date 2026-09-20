#!/bin/bash
# Clean run: start the lab services, drive the journeys, stop.
. /lab/env.sh
bash /lab/up.sh "http://localhost:3411/login" >/dev/null
python3 /lab/driver.py
STATUS=$?
pkill -u tester firefox-esr 2>/dev/null; pkill -u tester -f orca-lb 2>/dev/null
sleep 1
exit $STATUS
