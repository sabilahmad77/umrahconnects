#!/usr/bin/env python3
"""A12 — independent re-derivation of the Engineering 100 register's arithmetic.

`audit/eng100/register.py score` is the coordinator's own scorer; this script
recomputes the same three views from the raw rows without importing it, so a bug
or a convenient shortcut in that script cannot hide. It also checks what the
coordinator's scorer does NOT: that every evidence reference a PASS row carries
actually resolves to a file or a directory on disk.

Usage: python3 audit/a12-register-check.py [path-to-register.json]
"""
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTER = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'docs/control-tower/ENGINEERING_100_REGISTER.json')

# The provider-dependent obligations, taken from the requirement text rather than
# from register.py, so a change to either side shows up as a mismatch.
EXPECT_LAUNCH_ONLY = {'A11', 'A13', 'T04', 'O03', 'I06', 'I07'}
EXPECT_PARENTS = {
    'S23': (['S23.E'], ['W40.L']),
    'W40': (['W40.E', 'W40.L'], []),
    'D06': (['D06.E', 'D06.L'], []),
    'I08': (['I08.E', 'I08.L'], []),
    'W13': (['W13.E'], ['A11']),
    'W14': (['W14.E'], ['A13']),
    'W16': (['W16.E'], ['T04', 'N-PRV-1']),
}

reg = json.load(open(REGISTER))
rows = reg['requirements']
by_id = {r['id']: r for r in rows}
problems = []
notes = []


def problem(msg):
    problems.append(msg)


# ── shape ────────────────────────────────────────────────────────────────────
originals = [r for r in rows if r['kind'] == 'original']
if len(originals) != 131:
    problem(f'historical ledger holds {len(originals)} original rows, not 131')

dupes = [i for i, n in Counter(r['id'] for r in rows).items() if n > 1]
if dupes:
    problem(f'duplicate ids: {dupes}')

# ── provider-dependent rows are split the way the requirement text demands ───
launch_only = {r['id'] for r in rows if r['scope'] == 'launch' and r['kind'] == 'original'}
if launch_only != EXPECT_LAUNCH_ONLY:
    problem(f'launch-only original rows are {sorted(launch_only)}, expected {sorted(EXPECT_LAUNCH_ONLY)}')

parents = {r['id']: (list(r.get('children', [])), list(r.get('cross_refs', []))) for r in rows if r['scope'] == 'parent'}
if parents != EXPECT_PARENTS:
    problem(f'parent rows differ from the expected split:\n  got      {parents}\n  expected {EXPECT_PARENTS}')
for pid, (children, refs) in parents.items():
    for cid in children + refs:
        if cid not in by_id:
            problem(f'{pid} points at missing row {cid}')

# ── every PASS is supported ──────────────────────────────────────────────────
for r in rows:
    if r['status'] not in reg['statusValues']:
        problem(f"{r['id']}: status {r['status']!r} is not one of {reg['statusValues']}")
    if r['status'] != 'PASS':
        continue
    if not r.get('evidence'):
        problem(f"{r['id']}: PASS with no evidence")
    if not r.get('verifier'):
        problem(f"{r['id']}: PASS with no independent verifier")
    owner = (r.get('owner') or '').strip()
    verifier = (r.get('verifier') or '').strip()
    if owner and verifier and owner == verifier:
        problem(f"{r['id']}: PASS verified by its own owner ({owner})")
    for ev in r.get('evidence', []):
        # A path-looking reference must resolve; a command or a prose note need not.
        for token in re.findall(r'(?:^|[\s`(])((?:docs|audit|platform|apps|infrastructure|scripts)/[\w./@-]+)', ev):
            if not os.path.exists(os.path.join(ROOT, token.rstrip('.,;:`'))):
                problem(f"{r['id']}: evidence path does not exist — {token}")

# ── the three views, recomputed from the rows ────────────────────────────────
passed = lambda rid: by_id[rid]['status'] == 'PASS'
eng = [r for r in rows if r['scope'] == 'engineering']
launch = [r for r in rows if r['scope'] in ('engineering', 'launch')]
hist = []
for r in originals:
    obligations = [r['id']] if r['scope'] != 'parent' else list(r['children'])
    obligations += r.get('cross_refs', [])
    hist.append((r['id'], all(passed(o) for o in obligations if o in by_id)))

e_p, l_p = sum(1 for r in eng if r['status'] == 'PASS'), sum(1 for r in launch if r['status'] == 'PASS')
h_p = sum(1 for _, ok in hist if ok)
new = [r for r in rows if r['kind'] == 'new']
n_p = sum(1 for r in new if r['status'] == 'PASS')

derived = {
    'historical': f'{h_p} / 131',
    'new': f'{n_p} / {len(new)}',
    'engineering': f'{e_p} / {len(eng)} = {100 * e_p / len(eng):.1f}',
    'launch': f'{l_p} / {len(launch)} = {100 * l_p / len(launch):.1f}',
    'gates': {g: v['status'] for g, v in reg['gates'].items()},
}
print('A12 independent re-derivation')
print(json.dumps(derived, indent=1, ensure_ascii=False))
print(f"\nstatus mix: {dict(Counter(r['status'] for r in rows))}")
print(f"candidate revision in the register: {reg['candidate'].get('revision')}  updatedAt: {reg['updatedAt']}")

if h_p and not problems:
    notes.append('every PASS carries evidence, an independent verifier, and evidence paths that resolve')
for n in notes:
    print(f'  note: {n}')
if problems:
    print(f'\n{len(problems)} problem(s):')
    for p in problems:
        print(f'  - {p}')
    sys.exit(1)
print('\nno arithmetic or support problems found')
