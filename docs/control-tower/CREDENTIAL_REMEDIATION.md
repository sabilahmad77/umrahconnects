# Credential remediation — Engineering 100 loop (2026-09-18)

Scope: only the two credentials previously reported (W40, historical S23), plus
any further secret actually found. GitHub access for this machine was preserved:
no remote was removed, no `gh auth logout`, no unrelated token or SSH key touched.
No raw secret appears in this file; credentials are identified by type, a
4-character prefix and a SHA-256 fingerprint of the value.

## Where they were exposed

| Credential | Fingerprint (sha256, first 12) | Pushed commits containing it | Reachable from | Local plaintext copies (gitignored) |
|---|---|---|---|---|
| GitHub classic personal access token (`ghp_`, 40 chars) | `a8381db2fa51` | 5074b81, 8e4fdb6, 05cd312, 36acc27 — file `.claude/settings.local.json` | `origin/main`, `origin/develop` (repository is **public**) | `.claude/settings.local.json` in all four local worktrees |
| Render API key (`rnd_`, 32 chars) | `0d647eced966` | 8e4fdb6, 05cd312, 36acc27 — same file | `origin/main`, `origin/develop` | same four files |

The file has been untracked and ignored since a99f948. That stops new exposure;
it does not un-publish the values already in public history, and an ignored file
is not revocation.

## Status — verified 2026-09-18 17:0x +0500 against each provider's own API

| Credential | Check (value read from the local file, never printed) | Result | State |
|---|---|---|---|
| GitHub PAT `a8381db2fa51` | `GET https://api.github.com/user` with the token | **401 "Bad credentials"** | **Revoked / invalid.** Consistent with GitHub's automatic revocation of personal access tokens found in public repositories; the account security log was not consulted. Nothing further to revoke. |
| Render API key `0d647eced966` | `GET https://api.render.com/v1/owners` with the key | **200** | **ACTIVE — P0 exposure remains open.** |

Blast radius of the active Render key (read-only enumeration, names only): one
workspace ("My Workspace"), one service — `umrah-connect-api`
(`srv-d94peplckfvc73adlr9g`, web service, not suspended, public URL times out),
no Render Postgres. Render keys are not scoped, so the key can deploy, change
environment variables or delete that service. No other project's resources were
visible to it.

## GitHub access after remediation

| Check | Result |
|---|---|
| `gh auth status` | logged in as `sabilahmad77` via an OAuth token (`gho_…`) stored in the macOS keyring — **not** the exposed PAT; scopes `gist, read:org, repo, workflow` |
| `gh api repos/sabilahmad77/umrahconnects` → `permissions` | `admin, maintain, push, pull, triage` all true |
| `git ls-remote --heads origin` | succeeds (`main`, `develop`) |
| git credential helper | `osxkeychain` |

Current repository access does not depend on the exposed PAT in any way, so its
revocation cannot break anything.

## Remaining action — Render key (owner)

Revoking an account API key is a change to the provider account's security
settings. The coordinator did not perform it: the session's safety rules reserve
security-setting changes for the account owner even when authorized, and Render
has no API for revoking keys. This is the only step needed:

1. Render Dashboard → Account Settings → **API Keys** → revoke the key whose value
   starts `rnd_Dsvl` (32 characters). Do not create a replacement key — the target
   architecture no longer uses Render.
2. Verify (prints only the status code):

   ```bash
   RN=$(grep -oE 'rnd_[A-Za-z0-9_]{28}' /Users/macbook/Projects/umrah-connects/.claude/settings.local.json | head -1); curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $RN" https://api.render.com/v1/owners; unset RN
   ```

   Expected: `401`. The coordinator re-runs this check before the final report.
3. Afterwards, delete the dead allow-list entries from the four local
   `.claude/settings.local.json` files (they only ever held these credentials).

## History

Rewriting pushed history is out of scope for this loop (no force-push). Once
both credentials are invalid, the values in history are inert. If the owner
still wants them removed from history, follow
https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
(`git filter-repo --path .claude/settings.local.json --invert-paths`, force-push
every branch and tag, ask GitHub Support to purge cached views and dangling
commits, and have every collaborator re-clone). That is a coordinated,
destructive operation and is recorded here only as a plan.

## Other secrets

The integrated tree and the Codex capture were scanned for GitHub, Render,
Stripe (`sk_`, `rk_`, `whsec_`), AWS (`AKIA…`) and private-key patterns before
every commit in this loop: none found. The final candidate scan is recorded in
`ENGINEERING_100_FINAL_REPORT.md`.
