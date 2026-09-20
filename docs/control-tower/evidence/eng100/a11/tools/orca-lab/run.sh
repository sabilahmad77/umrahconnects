#!/bin/bash
# Host side of the Orca lab: prepare the identity, run the container, scrub outputs.
set -u
BASE="$TMPDIR/uc-a11/orca"
RUN="$BASE/runs/$(date +%Y%m%d-%H%M%S)"
KEY="${1:-travelerA}"
mkdir -p "$RUN/out" "$BASE/secrets"
chmod 0777 "$RUN/out"
python3 - "$KEY" "$BASE/secrets/identity.json" <<'PY'
import json, sys, os
key, dest = sys.argv[1], sys.argv[2]
ids = json.load(open('/Users/macbook/Projects/umrah-connects-integration/.project/local/qa-credentials.json'))['identities']
who = next(i for i in ids if i['key'] == key)
with open(dest, 'w') as f:
    json.dump({'email': who['email'], 'password': who['password']}, f)
os.chmod(dest, 0o644)
PY
echo "run dir: $RUN"
docker rm -f uc-a11-orca-run >/dev/null 2>&1
docker create --name uc-a11-orca-run --shm-size=1g uc-a11-orca-lab:local bash /lab/session.sh >/dev/null
docker cp "$BASE/lab" uc-a11-orca-run:/lab
docker cp "$BASE/secrets" uc-a11-orca-run:/secrets
rm -f "$BASE/secrets/identity.json"
docker start -a uc-a11-orca-run > "$RUN/driver.log" 2>&1
echo "container exit $?"
docker cp uc-a11-orca-run:/home/tester/out/. "$RUN/out/"
docker rm -f uc-a11-orca-run >/dev/null
# Scrub: no file kept from the run may contain the password.
python3 - "$KEY" "$RUN" <<'PY'
import json, sys, os
key, run = sys.argv[1], sys.argv[2]
ids = json.load(open('/Users/macbook/Projects/umrah-connects-integration/.project/local/qa-credentials.json'))['identities']
secret = next(i for i in ids if i['key'] == key)['password']
hits = 0
for root, _, files in os.walk(run):
    for name in files:
        p = os.path.join(root, name)
        data = open(p, 'r', errors='replace').read()
        if secret in data:
            hits += data.count(secret)
            open(p, 'w').write(data.replace(secret, '[REDACTED]'))
print(f'scrub: {hits} occurrence(s) of the password redacted')
PY
