# KVM blueprint validation (compose, Caddy, shell, workflows, host setup, systemd)

`infrastructure/kvm/scripts/validate-blueprint.sh` is the repeatable check (also run by `.github/workflows/infra-ci.yml`
on GitHub's Ubuntu runners, where shellcheck and systemd-analyze are installed; locally both ran in containers below).

## 1. validate-blueprint.sh, actionlint 1.7.7, shellcheck 0.11.0
```text
$ VALIDATE_NAME_PREFIX=uc-a09 infrastructure/kvm/scripts/validate-blueprint.sh

== shell syntax
PASS bash -n scripts/alert.sh
PASS bash -n scripts/check-offsite.sh
PASS bash -n scripts/deploy.sh
PASS bash -n scripts/firewall.sh
PASS bash -n scripts/healthcheck.sh
PASS bash -n scripts/host-setup.sh
PASS bash -n scripts/lib.sh
PASS bash -n scripts/orphan-cleanup.sh
PASS bash -n scripts/pg-backup.sh
PASS bash -n scripts/pg-restore.sh
PASS bash -n scripts/preflight.sh
PASS bash -n scripts/validate-blueprint.sh
PASS bash -n scripts/uptime-check.sh
PASS sh -n api-entrypoint.sh
SKIP shellcheck (not installed)

== compose configuration (both proxy modes)
PASS docker compose config (bundled proxy)
PASS bundled mode publishes only uc-caddy 80/443 [uc-caddy:443 uc-caddy:443 uc-caddy:80]
PASS shared mode without SHARED_PROXY_NETWORK is refused
PASS docker compose config (shared proxy)
PASS shared mode publishes no host port []

== Caddyfile
Valid configuration
PASS caddy validate (caddy:2.8)

== systemd units
SKIP systemd-analyze (not available)

validate-blueprint: all checks passed
[exit 0]

$ docker run --rm -v $PWD:/repo -w /repo rhysd/actionlint:1.7.7 -color   (all workflows: api-ci.yml, infra-ci.yml, uptime.yml)
[exit 0] (no output = no findings)

$ docker run --rm koalaman/shellcheck:stable (v0.11.0) -x -S warning scripts/*.sh api-entrypoint.sh ../../scripts/uptime-check.sh
[exit 0] (no output = no findings at warning level; 4 info-level notes remain by design: SC2012 portable ls parsing, SC2016 single-quoted eval bodies)
```

## 2. host-setup.sh and the systemd units on Ubuntu 24.04 (disposable container `uc-a09-hostsetup`)
Reproduces the reported gap (the deploy user cannot create `/var/backups/umrah-connect`), then runs the setup twice
(idempotent), converges a stale root-owned 0644 dump and a 0644 env file, and verifies every unit with systemd 255.
```text
== prepare: deploy user in the docker group, checkout at /opt/umrah-connect
== the reported gap: before setup, the deploy user cannot create the backup directory
mkdir: cannot create directory ‘/var/backups/umrah-connect’: Permission denied
[exit 1]
== a stale dump left by root with loose permissions (must be converged)
== run 1: sudo scripts/host-setup.sh
ok   /var/backups/umrah-connect (deploy:deploy 0700)
ok   /var/backups/umrah-connect/daily (deploy:deploy 0700)
ok   /var/backups/umrah-connect/weekly (deploy:deploy 0700)
ok   /var/lib/umrah-connect (deploy:deploy 0750)
ok   /opt/umrah-connect/infrastructure/kvm/.env.production (deploy 0600)
note systemd is not running here; units not installed
host setup complete
[exit 0]
== run 2 (idempotent)
ok   /var/backups/umrah-connect (deploy:deploy 0700)
ok   /var/backups/umrah-connect/daily (deploy:deploy 0700)
ok   /var/backups/umrah-connect/weekly (deploy:deploy 0700)
ok   /var/lib/umrah-connect (deploy:deploy 0750)
ok   /opt/umrah-connect/infrastructure/kvm/.env.production (deploy 0600)
note systemd is not running here; units not installed
host setup complete
[exit 0]
== resulting owners and modes
deploy:deploy 700 /var/backups/umrah-connect
deploy:deploy 700 /var/backups/umrah-connect/daily
deploy:deploy 700 /var/backups/umrah-connect/weekly
deploy:deploy 750 /var/lib/umrah-connect
deploy:deploy 600 /var/backups/umrah-connect/daily/old.dump
deploy:deploy 600 .env.production
== the deploy user can now write backups and the private-directory check of pg-backup.sh passes
owner=deploy group/other=------
[exit 0]
== systemd-analyze verify (units as installed, User=deploy, real script paths)
systemd 255 (255.4-1ubuntu8.17)
[verify exit 0]
== calendar expressions
    Next elapse: Sun 2026-09-20 02:30:00 UTC
   Iteration #2: Mon 2026-09-21 02:30:00 UTC
    Next elapse: Sun 2026-09-20 03:30:00 UTC
   Iteration #2: Mon 2026-09-21 03:30:00 UTC
```
