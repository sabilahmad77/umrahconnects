#!/usr/bin/env python3
"""Engineering 100 requirement register — single writer: the A01 coordinator.

The register (docs/control-tower/ENGINEERING_100_REGISTER.json) is the one
authoritative list. Every score is derived from it by this script, never typed
by hand.

  register.py init     create the register from the 131 original rows plus the
                       appended requirements below (refuses to overwrite)
  register.py score    recompute and print the three views and the gates
  register.py render   write ENGINEERING_100_SCORECARD.md and
                       LAUNCH_READINESS_SCORECARD.md from the register

Views
  historical  the 131 original IDs. An ID passes only when every obligation it
              carries passes, including real-provider children it cross-references.
  engineering every row whose scope includes "engineering".
  launch      every row (engineering rows plus launch-only rows).

A row counts as passed only with status PASS. BLOCKED, FAIL, OPEN, NOT DONE and
PARTIAL all count as not passed. Nothing is averaged or excluded.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTER = ROOT / 'docs/control-tower/ENGINEERING_100_REGISTER.json'
BASELINE = Path(__file__).with_name('original131.baseline.json')

# Original rows that are real-provider or production obligations only.
LAUNCH_ONLY_ORIGINAL = {
    'A11': 'Real Google OAuth client (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI) and a sign-in with a real Google account',
    'A13': 'SMTP mailbox + SPF/DKIM/DMARC; a real inbox receives reset and verification mail',
    'T04': 'Stripe account test keys; test-mode payment with Stripe test cards and webhook delivery',
    'O03': 'Cloudflare R2 buckets + scoped token; upload and signed download against real R2',
    'I06': 'Umrah KVM 8 target + SSH access, api.umrahconnect.io DNS, authorized deployment',
    'I07': 'www.umrahconnect.io added in Vercel domains with a valid certificate',
}

# Original rows split into an engineering child and a launch child. The parent
# keeps its original ID in the historical view and passes only if both pass.
SPLITS = {
    'S23': ('Current tree, build output and container image contain no secrets (scan)',
            None),  # launch obligation is the credential revocation row W40.L
    'W40': ('Credentials removed from tracked files and ignored going forward',
            'Every exposed credential revoked at its provider and confirmed invalid'),
    'D06': ('OFFSITE_REMOTE contract, validation and a rehearsed copy to a local rclone remote',
            'Off-site R2 bucket + rclone remote configured on the production host; nightly copy observed'),
    'I08': ('Uptime monitoring implemented (scheduled external check + host-side health alert), locally verified',
            'Monitoring activated against the production endpoints after cutover'),
    'W13': ('Google Sign-In UI, callback, errors, linking — verified against a stub OIDC provider', None),
    'W14': ('Verification page, banner, resend, expiry/replay — verified with local mail capture', None),
    'W16': ('Stripe Payment Element checkout for travelers and staff — verified with the sandbox path and stripe-mock', None),
}
# Cross-references: parent -> launch rows that must also pass for the historical ID.
CROSS_REFS = {'S23': ['W40.L'], 'W13': ['A11'], 'W14': ['A13'], 'W16': ['T04', 'N-PRV-1']}

NEW_ROWS = [
    # id, area, requirement, scope ('engineering' or 'launch'), owner
    ('N01', 'Integration', "Codex's post-merge uncommitted web work integrated without loss; Codex worktree untouched", 'engineering', 'A01'),
    ('N-LINK-1', 'Traveler linkage', 'Traveler↔pilgrim link only through an operator invitation accepted by the verified invited account; revocation, audit, cross-tenant claim prevention', 'engineering', 'A07'),
    ('N-SOC-1', 'Social', 'Posts: create, edit and delete own posts; others refused (UI + API)', 'engineering', 'A05'),
    ('N-SOC-2', 'Social', 'Comments: list with pagination, add, reply, edit and delete with correct counts and ownership', 'engineering', 'A05'),
    ('N-SOC-3', 'Social', 'Reactions and bookmarks toggle and persist per viewer', 'engineering', 'A05'),
    ('N-SOC-4', 'Social', 'Groups and membership: traveler groups, join/leave/invites; operator group management actions', 'engineering', 'A05'),
    ('N-SOC-5', 'Social', 'Connections and direct messages work end to end', 'engineering', 'A05'),
    ('N-SOC-6', 'Social', 'Notifications: list, mark read, mark all read; persisted', 'engineering', 'A05'),
    ('N-SOC-7', 'Social', 'Pagination / load more on feeds and lists', 'engineering', 'A05'),
    ('N-LST-1', 'Listings', 'Listing create, edit, publish/unpublish and archive with required fields and categories', 'engineering', 'A06'),
    ('N-LST-2', 'Listings', 'Real seller identity and real uploaded media on listings', 'engineering', 'A06'),
    ('N-LST-3', 'Listings', 'Marketplace search, filters and pagination', 'engineering', 'A06'),
    ('N-LST-4', 'Listings', 'Price units and currency correct from form to wire to display to checkout', 'engineering', 'A06'),
    ('N-LST-5', 'Listings', 'Listing ownership: another provider cannot edit, unpublish or delete', 'engineering', 'A06'),
    ('N-LST-6', 'Listings', 'Marketplace requests → offers → accept → booking', 'engineering', 'A06'),
    ('N-UPL-1', 'Uploads', 'Upload UX: picker, validation, progress, failure recovery', 'engineering', 'A06'),
    ('N-UPL-2', 'Uploads', 'Persisted object reference; preview or authorized download (new tab, signed URL re-minted)', 'engineering', 'A06'),
    ('N-UPL-3', 'Uploads', 'Replacement and deletion where supported', 'engineering', 'A06'),
    ('N-UPL-4', 'Uploads', 'Size/type rejection, permission denial, expired or tampered signed URL refused', 'engineering', 'A06'),
    ('N-ROLE-1', 'Role workflows', 'Operator workflows beyond the landing page (pilgrims, bookings, packages, groups, reports)', 'engineering', 'A03b/A04/A07'),
    ('N-ROLE-2', 'Role workflows', 'Hotel workflows (properties, room types, rooms, allotments, bookings, assignments)', 'engineering', 'A03b'),
    ('N-ROLE-3', 'Role workflows', 'Transport workflows (vehicles, drivers, routes, assignments, bookings)', 'engineering', 'A03b'),
    ('N-ROLE-4', 'Role workflows', 'Visa agency workflows (cases, documents, decisions, service requests)', 'engineering', 'A03b'),
    ('N-ROLE-5', 'Role workflows', 'Finance workflows (invoices, recorded payments, refunds, reporting) inside one organization', 'engineering', 'A04'),
    ('N-ROLE-6', 'Role workflows', 'Super Admin workflows (users, organizations, KYC, moderation, platform controls)', 'engineering', 'A03'),
    ('N-ROLE-7', 'Role workflows', 'Traveler workflows (requests, bookings, checkout, tracking, community)', 'engineering', 'A04/A05/A07'),
    ('N-FORM-1', 'Forms', 'Required fields present; client/server validation aligned; useful errors; duplicate-submit protection; persisted defaults', 'engineering', 'all'),
    ('N-QA-1', 'Browser QA', 'Functional browser matrix: every route × permitted role — positive, invalid, denied, empty/error, persistence — on the candidate in Chrome', 'engineering', 'A10'),
    ('N-OPS-1', 'Operations', 'Backup directory created and owned by the deploy user (idempotent)', 'engineering', 'A09'),
    ('N-OPS-4', 'Operations', 'Render runtime dependency removed from the target; stack builds and runs with no Render endpoint or credential', 'engineering', 'A09'),
    # launch-only
    ('N-OPS-5', 'Operations', 'Legacy Render service decommissioned after an authorized KVM cutover (backup first)', 'launch', 'Owner'),
    ('N-BRD-1', 'Brand', 'Approved standalone Makkah/Kaaba hero asset supplied at apps/web/public/images/hero/makkah-approved.webp', 'launch', 'Owner'),
    ('N-PRV-1', 'Payments', 'Stripe live activation: live keys, production webhook endpoint, account activation', 'launch', 'Owner'),
    ('N-DEP-1', 'Deployment', 'Production deployment of the reviewed candidate: Vercel env (API_PROXY_ORIGIN, PROXY_SHARED_SECRET) and KVM API', 'launch', 'Owner'),
]


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def init():
    if REGISTER.exists():
        sys.exit(f'{REGISTER} exists — refusing to overwrite (single writer; edit rows instead)')
    base = json.loads(BASELINE.read_text())
    rows = []
    for origin, items in (('core-90', base['core']), ('web-41', base['web'])):
        for r in items:
            rid = r['id']
            common = dict(area=r['area'], requirement=r['requirement'], origin=origin,
                          baseline={'status': r['status'], 'evidence': r['evidence']},
                          status='OPEN', evidence=[], files=[], revision=None, verifier=None, notes='')
            if rid in LAUNCH_ONLY_ORIGINAL:
                rows.append(dict(id=rid, scope='launch', kind='original', needs=LAUNCH_ONLY_ORIGINAL[rid], **common))
            elif rid in SPLITS:
                eng, launch = SPLITS[rid]
                rows.append(dict(id=rid, scope='parent', kind='original', children=[f'{rid}.E'] + ([f'{rid}.L'] if launch else []),
                                 cross_refs=CROSS_REFS.get(rid, []), **common))
                rows.append(dict(id=f'{rid}.E', scope='engineering', kind='split', parent=rid, **{**common, 'requirement': eng}))
                if launch:
                    rows.append(dict(id=f'{rid}.L', scope='launch', kind='split', parent=rid, **{**common, 'requirement': launch}))
            else:
                rows.append(dict(id=rid, scope='engineering', kind='original', cross_refs=CROSS_REFS.get(rid, []), **common))
    for rid, area, req, scope, owner in NEW_ROWS:
        rows.append(dict(id=rid, scope=scope, kind='new', origin='engineering-100', area=area, requirement=req,
                         owner=owner, baseline=None, status='OPEN', evidence=[], files=[], revision=None, verifier=None, notes=''))
    reg = {
        'schema': 'umrah-connect/engineering-100-register/v1',
        'createdAt': now(), 'updatedAt': now(), 'writer': 'A01 coordinator',
        'candidate': {'branch': 'engineering/100-loop', 'revision': None, 'fingerprint': None},
        'statusValues': ['PASS', 'FAIL', 'BLOCKED', 'PARTIAL', 'NOT DONE', 'OPEN'],
        'gates': {g: {'status': 'OPEN', 'evidence': ''} for g in (
            'G1 no unresolved P0 exposure', 'G2 no unresolved P0/P1 security or critical functional defect',
            'G3 authentication and authorization accepted', 'G4 tenant and Super Admin isolation accepted',
            'G5 data and money integrity accepted', 'G6 critical browser journeys accepted',
            'G7 builds and cold boot accepted', 'G8 provider and operational verification complete for launch')},
        'requirements': rows,
    }
    REGISTER.write_text(json.dumps(reg, indent=1, ensure_ascii=False) + '\n')
    print(f'created {REGISTER.relative_to(ROOT)} with {len(rows)} rows')


def views(reg):
    rows = {r['id']: r for r in reg['requirements']}
    passed = lambda rid: rows[rid]['status'] == 'PASS'
    eng = [r for r in reg['requirements'] if r['scope'] == 'engineering']
    launch = [r for r in reg['requirements'] if r['scope'] in ('engineering', 'launch')]
    hist = []
    for r in reg['requirements']:
        if r['kind'] != 'original':
            continue
        obligations = [r['id']] if r['scope'] != 'parent' else list(r['children'])
        obligations += r.get('cross_refs', [])
        hist.append((r['id'], all(passed(o) for o in obligations)))
    new = [r for r in reg['requirements'] if r['kind'] == 'new']
    return rows, eng, launch, hist, new


def score():
    reg = json.loads(REGISTER.read_text())
    rows, eng, launch, hist, new = views(reg)
    assert len(hist) == 131, f'historical ledger must hold 131 original IDs, found {len(hist)}'
    for r in reg['requirements']:
        assert r['status'] in reg['statusValues'], f"{r['id']}: bad status {r['status']}"
        if r['status'] == 'PASS':
            assert r['evidence'], f"{r['id']}: PASS without evidence"
            assert r.get('verifier'), f"{r['id']}: PASS without an independent verifier"
    count = lambda rs: sum(1 for r in rs if r['status'] == 'PASS')
    e_p, e_t = count(eng), len(eng)
    l_p, l_t = count(launch), len(launch)
    h_p = sum(1 for _, ok in hist if ok)
    n_p, n_t = count(new), len(new)
    out = {
        'historical': f'{h_p} / 131',
        'new': f'{n_p} / {n_t}',
        'engineering': f'{e_p} / {e_t} = {100 * e_p / e_t:.1f}',
        'launch': f'{l_p} / {l_t} = {100 * l_p / l_t:.1f}',
        'gates': {g: v['status'] for g, v in reg['gates'].items()},
    }
    print(json.dumps(out, indent=1, ensure_ascii=False))
    return reg, out


def render():
    reg, out = score()
    rows, eng, launch, hist, new = views(reg)
    def table(rs):
        lines = ['| ID | Area | Requirement | Status | Evidence | Verifier |', '|---|---|---|---|---|---|']
        for r in rs:
            ev = '; '.join(r['evidence'][:3]) if r['evidence'] else (r.get('notes') or '—')
            lines.append(f"| {r['id']} | {r['area']} | {r['requirement']} | **{r['status']}** | {ev} | {r.get('verifier') or '—'} |")
        return '\n'.join(lines)
    head = f"Derived from `ENGINEERING_100_REGISTER.json` by `audit/eng100/register.py render` at {now()}. Do not edit by hand.\n"
    (ROOT / 'docs/control-tower/ENGINEERING_100_SCORECARD.md').write_text(
        f"# Engineering 100 — local engineering acceptance\n\n{head}\n"
        f"**Engineering score: {out['engineering']}**  ·  historical {out['historical']}  ·  new {out['new']}\n\n"
        f"Candidate: `{reg['candidate']['branch']}` @ `{reg['candidate']['revision']}`\n\n{table(eng)}\n")
    (ROOT / 'docs/control-tower/LAUNCH_READINESS_SCORECARD.md').write_text(
        f"# Engineering 100 — ready-to-launch\n\n{head}\n**Launch-readiness score: {out['launch']}**\n\n"
        '## Mandatory gates\n\n| Gate | Status | Evidence |\n|---|---|---|\n' +
        '\n'.join(f"| {g} | **{v['status']}** | {v['evidence'] or '—'} |" for g, v in reg['gates'].items()) +
        f"\n\n## Launch-only rows\n\n{table([r for r in launch if r['scope'] == 'launch'])}\n")
    print('rendered scorecards')


if __name__ == '__main__':
    {'init': init, 'score': score, 'render': render}[sys.argv[1] if len(sys.argv) > 1 else 'score']()
