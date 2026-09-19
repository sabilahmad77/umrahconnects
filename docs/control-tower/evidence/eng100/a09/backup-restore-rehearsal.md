# Backup integrity and restore rehearsal

Disposable resources only: the source database `uc_a09_restore_src` lives in the disposable stack `uc-a09-kvm` and was
seeded from a `pg_dump -Fc` of my own dev database `umrah_eng100_a09` (read-only dump; 76 tables, 33 users,
3 migrations). The restore target is a **separate** PostgreSQL 16 container `uc-a09-pg-restore` with no network,
database `uc_a09_restore_dst`. No legitimate database was restored over. Backups went to `~/.uc-a09-rehearsal/backups`.

The off-site copy used a local **S3-compatible stand-in (MinIO) — not Cloudflare R2**, through the official rclone
image (`rclone/rclone:1.68`) with the same remote settings the runbook requires for R2 (`type = s3`, `acl = private`,
`no_check_bucket = true`; only `provider`/`endpoint` differ). Real R2 behaviour is UNVERIFIED until the owner configures
the bucket and token.

Summary:
- Original scripts (9a4da31): three defects reproduced — the weekly retention line aborts the backup under
  `pipefail` on six days of seven (before the off-site copy), `.sha256` files recorded absolute paths so weekly or
  downloaded copies cannot be verified, and a missing `.sha256` silently skipped verification before a restore.
- New contract: backup directory missing → clear error; `OFFSITE_REMOTE` unset or malformed → the local dump is still
  written and verified, then exit 3 with the reason; unreachable destination → exit 3; working destination → size-
  verified off-site copy; `check-offsite.sh` round trip; `preflight.sh` all PASS.
- Restore: the downloaded off-site copy verifies by checksum, lists 76 tables, restores into the separate container,
  and **all 76 tables / 865 rows match the source exactly** (row count and content hash per table). `pg-restore.sh
  verify` passes and drops its scratch database; tampered and checksum-less dumps are refused; `replace` refuses a
  wrong confirmation, takes a safety backup, restores a deliberately deleted row, and the API serves again.

## 1. Seed, backup-directory and OFFSITE_REMOTE contract, off-site path
```text
# source: pg_dump -Fc of my own dev DB umrah_eng100_a09 (127.0.0.1:5433), restored into a disposable DB in the disposable stack
$ docker compose --env-file .env.production exec -T uc-postgres createdb -U umrah uc_a09_restore_src
[exit 0]
$ sh -c docker compose --env-file .env.production exec -T uc-postgres pg_restore -U umrah -d uc_a09_restore_src --no-owner --no-privileges --exit-on-error < '$TMPDIR/uc-a09/dev-source.dump'
[exit 0]
$ docker compose --env-file .env.production exec -T uc-postgres psql -X -At -U umrah -d uc_a09_restore_src -c select count(*) as tables from pg_tables where schemaname not in ('pg_catalog','information_schema') -c select count(*) as users from core.users -c select count(*) as applied_migrations from _prisma_migrations where finished_at is not null
76
33
3
[exit 0]
$ docker compose --env-file .env.production up -d --wait --wait-timeout 240 uc-api
[exit 0]
$ POST /api/v1/auth/login (seeded demo operator admin@alharamain.sa) -> access token MISSING
$ GET /api/v1/auth/me -> 503
$ GET /api/v1/bookings -> 503
$ GET /api/v1/pilgrims -> 503

# after Caddy re-marked the upstream healthy (see the Caddy fix below)
$ POST /api/v1/auth/login (seeded demo operator admin@alharamain.sa) -> access token received
$ GET /api/v1/auth/me -> 200 keys=sub,email,phone,tenantId,tenantType,tenantStatus
$ GET /api/v1/bookings -> 200 1 items
$ GET /api/v1/pilgrims -> 200 5 items

## Defects in the original scripts (9a4da31), minimal reproductions
# A1 original retention line: weekly/ empty (Mon–Sat) + set -euo pipefail aborts before the off-site step
$ bash -c set -euo pipefail; BACKUP_DIR=$(mktemp -d); mkdir -p "$BACKUP_DIR/weekly"; KEEP_WEEKLY=8; ls -1t "$BACKUP_DIR"/weekly/*.dump 2>/dev/null | tail -n +"$((KEEP_WEEKLY + 1))" | while read -r f; do rm -f "$f" "$f.sha256"; done; echo "reached the off-site step"
[exit 1]
# A2 original checksum format (absolute path): the weekly copy stops verifying once the daily file rotates out
$ bash -c d=$(mktemp -d); mkdir -p $d/daily $d/weekly; echo data > $d/daily/x.dump; sha256sum $d/daily/x.dump > $d/daily/x.dump.sha256; cp $d/daily/x.dump $d/daily/x.dump.sha256 $d/weekly/; rm $d/daily/x.dump; cd $d/weekly && sha256sum -c x.dump.sha256
sha256sum:  /var/folders/_0/47h8wgqx27199q4s8_0c9r_c0000gn/T/tmp.Y2bSesEkkz/daily/x.dump: No such file or directory
[exit 1]
# A3 original pg-restore.sh line: a missing .sha256 silently skips verification (&& list under set -e)
$ bash -c set -euo pipefail; DUMP=/nonexistent.dump; [ -f "$DUMP.sha256" ] && sha256sum -c "$DUMP.sha256"; echo "continued to restore without any checksum"
continued to restore without any checksum
[exit 0]

## New pg-backup.sh: backup directory and OFFSITE_REMOTE contract
# B1 backup directory missing and not creatable by this user -> clear error, nothing dumped
$ env BACKUP_DIR=/var/backups/umrah-connect ./scripts/pg-backup.sh
ERROR: backup directory /var/backups/umrah-connect is missing and macbook cannot create it — run 'sudo scripts/host-setup.sh' once
[exit 1]
# B2 OFFSITE_REMOTE unset -> local backup complete, loud failure, exit 3
$ env BACKUP_DIR=/Users/macbook/.uc-a09-rehearsal/backups ./scripts/pg-backup.sh
12:52:50Z dumping database uc_a09_restore_src
12:52:51Z local backup ok: /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125250Z.dump (256K, 76 tables, sha256 recorded)
OFFSITE BACKUP FAILED: OFFSITE_REMOTE is not set in .env.production. A backup kept only on this server's disk is not acceptable in production (README: Backups and restore).
The local backup /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125250Z.dump is complete; only its off-site copy is missing.
[exit 3]
$ sh -c ls -ld '/Users/macbook/.uc-a09-rehearsal/backups' '/Users/macbook/.uc-a09-rehearsal/backups/daily' | cut -c1-10; ls -l '/Users/macbook/.uc-a09-rehearsal/backups/daily' | awk 'NR>1{print $1, $9}'
drwx------
drwx------
-rw-------@ uc_a09_restore_src-20260919T125250Z.dump
-rw-------@ uc_a09_restore_src-20260919T125250Z.dump.sha256
[exit 0]
# B3 OFFSITE_REMOTE malformed -> exit 3, form explained
$ env BACKUP_DIR=/Users/macbook/.uc-a09-rehearsal/backups OFFSITE_REMOTE=umrah-connect-db-backups ./scripts/pg-backup.sh
12:52:51Z dumping database uc_a09_restore_src
12:52:51Z local backup ok: /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125251Z.dump (256K, 76 tables, sha256 recorded)
OFFSITE BACKUP FAILED: OFFSITE_REMOTE is not of the form <rclone-remote>:<bucket>[/<prefix>]
The local backup /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125251Z.dump is complete; only its off-site copy is missing.
[exit 3]
$ env BACKUP_DIR=/Users/macbook/.uc-a09-rehearsal/backups OFFSITE_REMOTE=r2-backups:Bad_Bucket ./scripts/pg-backup.sh
12:52:51Z dumping database uc_a09_restore_src
12:52:51Z local backup ok: /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125251Z.dump (256K, 76 tables, sha256 recorded)
OFFSITE BACKUP FAILED: OFFSITE_REMOTE is not of the form <rclone-remote>:<bucket>[/<prefix>]
The local backup /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125251Z.dump is complete; only its off-site copy is missing.
[exit 3]
# B4 rehearsal escape hatch -> exit 0 with a warning
$ env BACKUP_DIR=/Users/macbook/.uc-a09-rehearsal/backups ALLOW_LOCAL_ONLY_BACKUP=1 ./scripts/pg-backup.sh
12:52:51Z dumping database uc_a09_restore_src
12:52:52Z local backup ok: /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125251Z.dump (256K, 76 tables, sha256 recorded)
WARNING: OFFSITE_REMOTE is not set; ALLOW_LOCAL_ONLY_BACKUP=1 accepts a local-only backup (rehearsals only)
[exit 0]
# B5 check-offsite.sh: unset / malformed / rclone missing
$ env OFFSITE_REMOTE= ./scripts/check-offsite.sh
ERROR: OFFSITE_REMOTE is not set in .env.production (required in production)
[exit 1]
$ env OFFSITE_REMOTE=r2-backups:x ./scripts/check-offsite.sh
ERROR: OFFSITE_REMOTE must look like <rclone-remote>:<bucket>[/<prefix>], e.g. r2-backups:umrah-connect-db-backups/production
[exit 1]
$ env PATH=/usr/bin:/bin OFFSITE_REMOTE=r2-backups:umrah-connect-db-backups/rehearsal ./scripts/check-offsite.sh
ERROR: rclone is not installed (apt install rclone)
[exit 1]

## Off-site path against a local S3-compatible stand-in (MinIO, network uc-a09-offsite) — NOT Cloudflare R2
# rclone.conf (values not shown): type=s3 provider=Minio endpoint=http://uc-a09-minio:9000 acl=private no_check_bucket=true
$ rclone mkdir r2-backups:umrah-connect-db-backups
[exit 0]
# C1 reachability round trip succeeds
$ env OFFSITE_REMOTE=r2-backups:umrah-connect-db-backups/rehearsal ./scripts/check-offsite.sh
2026/09/19 12:53:15 ERROR : Macbooks-MacBook-Pro-20260919T125312Z.txt: Post request rcat error: operation error S3: PutObject, https response error StatusCode: 404, RequestID: 18D6B9FC4E0B2D09, HostID: <masked>, api error NoSuchBucket: The specified bucket does not exist
2026/09/19 12:53:15 NOTICE: Failed to rcat with 2 errors: last error was: operation error S3: PutObject, https response error StatusCode: 404, RequestID: 18D6B9FC4E0B2D09, HostID: <masked>, api error NoSuchBucket: The specified bucket does not exist
ERROR: cannot write to r2-backups:umrah-connect-db-backups/rehearsal (credentials, bucket name, token scope, or no_check_bucket missing for a bucket-scoped token)
[exit 1]
# C2 unknown rclone remote -> clear failure
$ env OFFSITE_REMOTE=r2-nope:umrah-connect-db-backups/rehearsal ./scripts/check-offsite.sh
ERROR: rclone has no remote named 'r2-nope' for macbook (config file: /config/rclone/rclone.conf)
[exit 1]
# C3 bucket that does not exist -> write refused
$ env OFFSITE_REMOTE=r2-backups:no-such-bucket-a09/rehearsal ./scripts/check-offsite.sh
2026/09/19 12:53:16 ERROR : Macbooks-MacBook-Pro-20260919T125313Z.txt: Post request rcat error: operation error S3: PutObject, https response error StatusCode: 404, RequestID: 18D6B9FC87E8F118, HostID: <masked>, api error NoSuchBucket: The specified bucket does not exist
2026/09/19 12:53:16 NOTICE: Failed to rcat with 2 errors: last error was: operation error S3: PutObject, https response error StatusCode: 404, RequestID: 18D6B9FC87E8F118, HostID: <masked>, api error NoSuchBucket: The specified bucket does not exist
ERROR: cannot write to r2-backups:no-such-bucket-a09/rehearsal (credentials, bucket name, token scope, or no_check_bucket missing for a bucket-scoped token)
[exit 1]
# C4 backup with a working off-site destination -> exit 0, size verified
$ env BACKUP_DIR=/Users/macbook/.uc-a09-rehearsal/backups ./scripts/pg-backup.sh
12:53:14Z dumping database uc_a09_restore_src
12:53:14Z local backup ok: /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125314Z.dump (256K, 76 tables, sha256 recorded)
2026/09/19 12:53:16 ERROR : uc_a09_restore_src-20260919T125314Z.dump: Failed to copy: operation error S3: PutObject, https response error StatusCode: 404, RequestID: 18D6B9FCB29C4146, HostID: <masked>, api error NoSuchBucket: The specified bucket does not exist
2026/09/19 12:53:16 ERROR : Attempt 1/3 failed with 1 errors and: operation error S3: PutObject, https response error StatusCode: 404, RequestID: 18D6B9FCB29C4146, HostID: <masked>, api error NoSuchBucket: The specified bucket does not exist
2026/09/19 12:53:16 ERROR : uc_a09_restore_src-20260919T125314Z.dump: Failed to copy: operation error S3: PutObject, https response error StatusCode: 404, RequestID: 18D6B9FCB2CC7AFA, HostID: <masked>, api error NoSuchBucket: The specified bucket does not exist
2026/09/19 12:53:16 ERROR : Attempt 2/3 failed with 1 errors and: operation error S3: PutObject, https response error StatusCode: 404, RequestID: 18D6B9FCB2CC7AFA, HostID: <masked>, api error NoSuchBucket: The specified bucket does not exist
2026/09/19 12:53:16 ERROR : uc_a09_restore_src-20260919T125314Z.dump: Failed to copy: operation error S3: PutObject, https response error StatusCode: 404, RequestID: 18D6B9FCB2FD03C8, HostID: <masked>, api error NoSuchBucket: The specified bucket does not exist
2026/09/19 12:53:16 ERROR : Attempt 3/3 failed with 1 errors and: operation error S3: PutObject, https response error StatusCode: 404, RequestID: 18D6B9FCB2FD03C8, HostID: <masked>, api error NoSuchBucket: The specified bucket does not exist
2026/09/19 12:53:16 NOTICE: Failed to copyto: operation error S3: PutObject, https response error StatusCode: 404, RequestID: 18D6B9FCB2FD03C8, HostID: <masked>, api error NoSuchBucket: The specified bucket does not exist
OFFSITE BACKUP FAILED: rclone could not upload to r2-backups:umrah-connect-db-backups/rehearsal (diagnose with scripts/check-offsite.sh)
The local backup /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125314Z.dump is complete; only its off-site copy is missing.
[exit 3]
$ rclone lsl r2-backups:umrah-connect-db-backups/rehearsal/daily
2026/09/19 12:53:17 NOTICE: Failed to lsl: directory not found
[exit 3]
# C5 off-site destination unreachable during a backup (stand-in stopped) -> local ok, exit 3
$ env BACKUP_DIR=/Users/macbook/.uc-a09-rehearsal/backups RCLONE_RETRIES=1 RCLONE_LOW_LEVEL_RETRIES=1 RCLONE_CONTIMEOUT=5s ./scripts/pg-backup.sh
12:53:15Z dumping database uc_a09_restore_src
12:53:15Z local backup ok: /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125315Z.dump (256K, 76 tables, sha256 recorded)
2026/09/19 12:53:19 ERROR : Attempt 1/3 failed with 1 errors and: operation error S3: HeadObject, https response error StatusCode: 0, RequestID: , HostID: , request send failed, Head "http://uc-a09-minio:9000/umrah-connect-db-backups/rehearsal/daily/uc_a09_restore_src-20260919T125315Z.dump": dial tcp: lookup uc-a09-minio on 127.0.0.11:53: no such host
2026/09/19 12:53:19 ERROR : Attempt 2/3 failed with 1 errors and: operation error S3: HeadObject, https response error StatusCode: 0, RequestID: , HostID: , request send failed, Head "http://uc-a09-minio:9000/umrah-connect-db-backups/rehearsal/daily/uc_a09_restore_src-20260919T125315Z.dump": dial tcp: lookup uc-a09-minio on 127.0.0.11:53: no such host
2026/09/19 12:53:19 ERROR : Attempt 3/3 failed with 1 errors and: operation error S3: HeadObject, https response error StatusCode: 0, RequestID: , HostID: , request send failed, Head "http://uc-a09-minio:9000/umrah-connect-db-backups/rehearsal/daily/uc_a09_restore_src-20260919T125315Z.dump": dial tcp: lookup uc-a09-minio on 127.0.0.11:53: no such host
2026/09/19 12:53:19 NOTICE: Failed to copyto: operation error S3: HeadObject, https response error StatusCode: 0, RequestID: , HostID: , request send failed, Head "http://uc-a09-minio:9000/umrah-connect-db-backups/rehearsal/daily/uc_a09_restore_src-20260919T125315Z.dump": dial tcp: lookup uc-a09-minio on 127.0.0.11:53: no such host
OFFSITE BACKUP FAILED: rclone could not upload to r2-backups:umrah-connect-db-backups/rehearsal (diagnose with scripts/check-offsite.sh)
The local backup /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125315Z.dump is complete; only its off-site copy is missing.
[exit 3]
# C6 preflight (deploy gate) with the full configuration
$ env BACKUP_DIR=/Users/macbook/.uc-a09-rehearsal/backups ./scripts/preflight.sh
PASS .env.production is owned by macbook
PASS .env.production is not readable by group/other (chmod 600)
PASS proxy mode: bundled (this stack's Caddy owns :80/:443)
PASS POSTGRES_PASSWORD is set
PASS JWT_SECRET is set
PASS API_DOMAIN is set
PASS WEB_URL is set
PASS CORS_ORIGINS is set
PASS OFFSITE_REMOTE is set
PASS ACME_EMAIL is set
PASS POSTGRES_PASSWORD is URL-safe and at least 24 characters (openssl rand -hex 32)
PASS JWT_SECRET is at least 32 characters
PASS no template placeholder (<…>) is left in a value
PASS no setting points at Render (onrender.com / render.com) — Render is retired
PASS OFFSITE_REMOTE has the form <rclone-remote>:<bucket>[/<prefix>]
2026/09/19 12:53:22 ERROR : Macbooks-MacBook-Pro-20260919T125320Z.txt: Post request rcat error: operation error S3: PutObject, https response error StatusCode: 404, RequestID: 18D6B9FE0A16A88D, HostID: <masked>, api error NoSuchBucket: The specified bucket does not exist
2026/09/19 12:53:22 NOTICE: Failed to rcat with 2 errors: last error was: operation error S3: PutObject, https response error StatusCode: 404, RequestID: 18D6B9FE0A16A88D, HostID: <masked>, api error NoSuchBucket: The specified bucket does not exist
ERROR: cannot write to r2-backups:umrah-connect-db-backups/rehearsal (credentials, bucket name, token scope, or no_check_bucket missing for a bucket-scoped token)
FAIL off-site destination is reachable (scripts/check-offsite.sh)
PASS docker compose configuration is valid
PASS only uc-caddy publishes host ports (80, 443)
PASS /Users/macbook/.uc-a09-rehearsal/backups exists, is owned by macbook and is private
PASS disk holding /Users/macbook/.uc-a09-rehearsal/backups is below 85 % used (45 %)
preflight: 1 check(s) failed
[exit 1]

# finding: with no_check_bucket = true, 'rclone mkdir' silently does NOT create the bucket (exit 0), and a global
# --s3-no-check-bucket=false flag does not override the remote config. In production the bucket is created in the
# Cloudflare dashboard; here it is created once with a connection-string override.
$ rclone mkdir r2-backups,no_check_bucket=false:umrah-connect-db-backups
[exit 0]
$ rclone lsd r2-backups:
          -1 2026-09-19 12:54:11        -1 umrah-connect-db-backups
[exit 0]
# C1 reachability round trip succeeds
$ ./scripts/check-offsite.sh
12:54:10Z off-site destination reachable: r2-backups:umrah-connect-db-backups/rehearsal (write, read-back and delete verified)
[exit 0]
# C4 backup with a working off-site destination -> exit 0, size verified
$ env BACKUP_DIR=/Users/macbook/.uc-a09-rehearsal/backups ./scripts/pg-backup.sh
12:54:10Z dumping database uc_a09_restore_src
12:54:11Z local backup ok: /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125410Z.dump (256K, 76 tables, sha256 recorded)
12:54:11Z off-site copy ok: r2-backups:umrah-connect-db-backups/rehearsal/daily/uc_a09_restore_src-20260919T125410Z.dump (260606 bytes verified)
[exit 0]
$ rclone lsl r2-backups:umrah-connect-db-backups/rehearsal/daily
   260606 2026-09-19 12:54:10.887755319 uc_a09_restore_src-20260919T125410Z.dump
      107 2026-09-19 12:54:11.019505777 uc_a09_restore_src-20260919T125410Z.dump.sha256
[exit 0]
$ rclone ls r2-backups:umrah-connect-db-backups/rehearsal/.preflight
[exit 0]
# C6 preflight (deploy gate) with the full configuration
$ env BACKUP_DIR=/Users/macbook/.uc-a09-rehearsal/backups ./scripts/preflight.sh
PASS .env.production is owned by macbook
PASS .env.production is not readable by group/other (chmod 600)
PASS proxy mode: bundled (this stack's Caddy owns :80/:443)
PASS POSTGRES_PASSWORD is set
PASS JWT_SECRET is set
PASS API_DOMAIN is set
PASS WEB_URL is set
PASS CORS_ORIGINS is set
PASS OFFSITE_REMOTE is set
PASS ACME_EMAIL is set
PASS POSTGRES_PASSWORD is URL-safe and at least 24 characters (openssl rand -hex 32)
PASS JWT_SECRET is at least 32 characters
PASS no template placeholder (<…>) is left in a value
PASS no setting points at Render (onrender.com / render.com) — Render is retired
PASS OFFSITE_REMOTE has the form <rclone-remote>:<bucket>[/<prefix>]
12:54:13Z off-site destination reachable: r2-backups:umrah-connect-db-backups/rehearsal (write, read-back and delete verified)
PASS off-site destination is reachable (scripts/check-offsite.sh)
PASS docker compose configuration is valid
PASS only uc-caddy publishes host ports (80, 443)
PASS /Users/macbook/.uc-a09-rehearsal/backups exists, is owned by macbook and is private
PASS disk holding /Users/macbook/.uc-a09-rehearsal/backups is below 85 % used (45 %)
preflight: all checks passed
[exit 0]
```

## 2. Restore, comparison, drill, refusals, replace
Comparison query (`fingerprint.sql`, run on source and target):
```sql
SELECT format('SELECT %L AS tbl, count(*) AS n, md5(coalesce(string_agg(md5(x::text), '','' ORDER BY md5(x::text)), '''')) AS content_md5 FROM %I.%I x',
              schemaname || '.' || tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1 \gexec
```
```text
## Restore rehearsal (disposable databases/containers only)
# 1. quiesce writes, fresh backup of uc_a09_restore_src (local + off-site)
$ docker compose --env-file .env.production stop uc-api
[exit 0]
$ env BACKUP_DIR=/Users/macbook/.uc-a09-rehearsal/backups ./scripts/pg-backup.sh
12:54:48Z dumping database uc_a09_restore_src
12:54:49Z local backup ok: /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125448Z.dump (256K, 76 tables, sha256 recorded)
12:54:49Z off-site copy ok: r2-backups:umrah-connect-db-backups/rehearsal/daily/uc_a09_restore_src-20260919T125448Z.dump (260606 bytes verified)
[exit 0]
# 2. source fingerprint: row count + content md5 of every table
$ psql uc_a09_restore_src < fingerprint.sql -> 76 tables, 865 rows
# 3. download the OFF-SITE copy (dump + .sha256) into another directory and verify it there
$ rclone copy r2-backups:umrah-connect-db-backups/rehearsal/daily/ /Users/macbook/.uc-a09-rehearsal/downloaded/ --include uc_a09_restore_src-20260919T125448Z.dump*
[exit 0]
$ sh -c cd '/Users/macbook/.uc-a09-rehearsal/downloaded' && sha256sum -c 'uc_a09_restore_src-20260919T125448Z.dump.sha256'
uc_a09_restore_src-20260919T125448Z.dump: OK
[exit 0]
$ sh -c docker compose --env-file .env.production exec -T uc-postgres pg_restore --list < '/Users/macbook/.uc-a09-rehearsal/downloaded/uc_a09_restore_src-20260919T125448Z.dump' | grep -c ' TABLE DATA '
76
[exit 0]
# 4. restore the downloaded copy into a SEPARATE disposable PostgreSQL 16 container (no network) and compare
$ docker run -d --name uc-a09-pg-restore --network none -e POSTGRES_USER=umrah -e POSTGRES_PASSWORD=*** -e POSTGRES_DB=uc_a09_restore_dst postgres:16-bookworm
<container id>
[exit 0]
$ sh -c docker exec -i uc-a09-pg-restore pg_restore -U umrah -d uc_a09_restore_dst --no-owner --no-privileges --exit-on-error < '/Users/macbook/.uc-a09-rehearsal/downloaded/uc_a09_restore_src-20260919T125448Z.dump'
[exit 0]
$ psql (uc-a09-pg-restore) uc_a09_restore_dst < fingerprint.sql -> 76 tables, 865 rows
$ sh -c diff '$TMPDIR/uc-a09/fp-source.txt' '$TMPDIR/uc-a09/fp-target.txt' && echo 'IDENTICAL: every table has the same row count and content hash'
IDENTICAL: every table has the same row count and content hash
[exit 0]
# 5. the monthly drill: pg-restore.sh verify (scratch database in the stack, always dropped)
$ docker compose --env-file .env.production start uc-api
[exit 0]
$ ./scripts/pg-restore.sh /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125448Z.dump verify
12:54:55Z dump ok: checksum verified, archive lists 76 tables
audit.audit_logs	125
core.otp_codes	20
core.permissions	58
core.public_inquiries	0
core.refresh_tokens	154
core.role_permissions	273
core.roles	11
core.tenant_kyc	0
core.tenant_plugins	0
core.tenants	11
core.user_identities	0
core.user_roles	34
core.users	33
marketplace.listing_bookings	4
marketplace.listing_inquiries	0
marketplace.listings	9
marketplace.marketplace_requests	3
marketplace.quotes	0
marketplace.request_offers	0
marketplace.vendor_ratings	0
marketplace.vendors	5
plugin_booking.booking_pilgrims	0
plugin_booking.bookings	3
plugin_booking.packages	3
plugin_crm.family_groups	0
plugin_crm.pilgrim_documents	0
plugin_crm.pilgrims	15
plugin_finance.budget_plans	0
plugin_finance.fx_rates	0
plugin_finance.invoices	5
plugin_finance.ledger_entries	0
plugin_finance.payment_customers	0
plugin_finance.payment_transactions	25
plugin_finance.payment_webhook_events	0
plugin_finance.payments	14
plugin_group_ops.group_documents	0
plugin_group_ops.group_invites	0
plugin_group_ops.group_members	0
plugin_group_ops.group_notes	0
plugin_group_ops.group_poll_votes	0
plugin_group_ops.group_polls	0
plugin_group_ops.group_post_comments	0
plugin_group_ops.group_posts	0
plugin_group_ops.incidents	0
plugin_group_ops.trip_groups	3
plugin_hotel.allotments	0
plugin_hotel.hotel_bookings	0
plugin_hotel.hotels	7
plugin_hotel.room_assignments	0
plugin_hotel.room_types	6
plugin_hotel.rooms	0
plugin_transport.drivers	3
plugin_transport.tasreeh_permits	0
plugin_transport.transport_assignments	0
plugin_transport.transport_routes	3
plugin_transport.vehicle_drivers	4
plugin_transport.vehicles	8
plugin_visa.regulatory_submissions	0
plugin_visa.visa_applications	9
plugin_visa.visa_document_versions	3
plugin_visa.visa_documents	3
plugin_visa.visa_service_request_events	0
plugin_visa.visa_service_request_notes	0
plugin_visa.visa_service_requests	0
public._prisma_migrations	3
social.comments	0
social.connections	0
social.conversations	0
social.follows	0
social.messages	0
social.notifications	0
social.post_reports	0
social.posts	5
social.reactions	0
social.saved_posts	0
social.social_accounts	3
12:54:56Z restore verification ok: 76 tables, 865 rows, 3 applied migrations; scratch database dropped
[exit 0]
# 6. refusals: tampered dump, missing checksum
$ ./scripts/pg-restore.sh /Users/macbook/.uc-a09-rehearsal/tamper/uc_a09_restore_src-20260919T125448Z.dump verify
sha256sum: WARNING: 1 computed checksum did NOT match
uc_a09_restore_src-20260919T125448Z.dump: FAILED
ERROR: checksum mismatch for /Users/macbook/.uc-a09-rehearsal/tamper/uc_a09_restore_src-20260919T125448Z.dump — the file is damaged or not the original
[exit 1]
$ ./scripts/pg-restore.sh /Users/macbook/.uc-a09-rehearsal/tamper/uc_a09_restore_src-20260919T125448Z.dump verify
ERROR: missing /Users/macbook/.uc-a09-rehearsal/tamper/uc_a09_restore_src-20260919T125448Z.dump.sha256 — refusing to restore an unverified dump
[exit 1]
# 7. no scratch database left behind
$ docker compose --env-file .env.production exec -T uc-postgres psql -X -At -U umrah -d postgres -c select datname from pg_database where datname not in ('template0','template1') order by 1
postgres
uc_a09_restore_src
uc_a09_smoke
[exit 0]
# 8. replace (data-damage rollback) on the DISPOSABLE source database: damage a row, restore, confirm
$ docker compose --env-file .env.production exec -T uc-postgres psql -X -At -U umrah -d uc_a09_restore_src -c delete from core.users where email = 'traveler.b@umrahconnect.dev' returning email
traveler.b@umrahconnect.dev
DELETE 1
[exit 0]
# wrong confirmation -> aborted, nothing changed
$ sh -c printf 'umrah_connects\n' | ./scripts/pg-restore.sh '/Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125448Z.dump' replace
12:55:15Z dump ok: checksum verified, archive lists 76 tables
This REPLACES database uc_a09_restore_src with /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125448Z.dump.
Everything written after that dump was taken is lost.
ERROR: aborted
[exit 1]
# correct confirmation
$ sh -c printf 'uc_a09_restore_src\n' | BACKUP_DIR='/Users/macbook/.uc-a09-rehearsal/backups' ./scripts/pg-restore.sh '/Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125448Z.dump' replace
12:55:15Z dump ok: checksum verified, archive lists 76 tables
This REPLACES database uc_a09_restore_src with /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125448Z.dump.
Everything written after that dump was taken is lost.
12:55:15Z safety backup of the current state
12:55:15Z dumping database uc_a09_restore_src
12:55:16Z local backup ok: /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125515Z.dump (256K, 76 tables, sha256 recorded)
12:55:17Z off-site copy ok: r2-backups:umrah-connect-db-backups/rehearsal/daily/uc_a09_restore_src-20260919T125515Z.dump (260205 bytes verified)
12:55:19Z database uc_a09_restore_src replaced from /Users/macbook/.uc-a09-rehearsal/backups/daily/uc_a09_restore_src-20260919T125448Z.dump; uc-api restarted
[exit 0]
$ docker compose --env-file .env.production exec -T uc-postgres psql -X -At -U umrah -d uc_a09_restore_src -c select count(*) as users_restored from core.users where email = 'traveler.b@umrahconnect.dev'
1
[exit 0]
uc-api healthy
$ GET /api/v1/health/ready after replace -> 200
$ demo operator sign-in after replace -> OK; GET /api/v1/pilgrims -> 200
$ sh -c ls -1t '/Users/macbook/.uc-a09-rehearsal/backups/daily' | head -n 4
uc_a09_restore_src-20260919T125515Z.dump.sha256
uc_a09_restore_src-20260919T125515Z.dump
uc_a09_restore_src-20260919T125448Z.dump.sha256
uc_a09_restore_src-20260919T125448Z.dump
[exit 0]
```
