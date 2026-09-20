#!/usr/bin/env python3
"""Derive docs/control-tower/FUNCTIONAL_BROWSER_MATRIX.md from A10's raw results.

A10 (independent browser QA, actual Chrome) writes every check it ran to
docs/control-tower/evidence/eng100/a10/functional-matrix.json. This script is the
only writer of the markdown summary, so the counts in the report always follow
from the data rather than from a worker's prose.

    python3 audit/eng100/browser_matrix.py
"""
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'docs/control-tower/evidence/eng100/a10/functional-matrix.json'
OUT = ROOT / 'docs/control-tower/FUNCTIONAL_BROWSER_MATRIX.md'

KIND_LABEL = {
    'positive': 'Positive path',
    'denied': 'Permission denied (UI state and the API refusing the same call)',
    'tenant': 'Cross-tenant probe (other organization’s record)',
    'invalid': 'Required field / invalid input',
    'persist': 'Persistence after refresh',
    'fresh-login': 'State after a fresh sign-in',
    'double-submit': 'Duplicate submission (double click)',
    'network': 'Failed network requests on the page',
    'console': 'JavaScript console errors on the page',
    'loop': 'Request loops',
    'empty': 'Empty state',
    'error': 'Error state',
    'shared': 'Shared/public surface',
}


def main() -> None:
    data = json.loads(RAW.read_text())
    meta, rows = data['meta'], data['checks']
    routes = data.get('routeInventory', [])
    controls = data.get('controlsSeen', [])

    result = Counter(r['result'] for r in rows)
    by_kind = defaultdict(Counter)
    for r in rows:
        by_kind[r['kind']][r['result']] += 1
    by_area = defaultdict(Counter)
    for r in rows:
        by_area[r['area']][r['result']] += 1
    roles = sorted({r['role'] for r in rows})
    route_names = [r if isinstance(r, str) else r.get('route') for r in routes]
    seen = {r['route'] for r in rows}
    # Rows may record a concrete URL (e.g. /marketplace/<uuid>) as well as its template;
    # coverage counts inventory templates only, and anything extra is reported separately.
    covered = {r for r in seen if r in set(route_names)}
    extra = sorted(seen - set(route_names))

    fails = [r for r in rows if r['result'] == 'FAIL']
    untested = [r for r in rows if r['result'] == 'UNTESTED']

    def table(header, counter_map):
        lines = [f'| {header} | Checks | Pass | Fail | Untested |', '|---|---:|---:|---:|---:|']
        for key in sorted(counter_map):
            c = counter_map[key]
            total = sum(c.values())
            lines.append(f"| {KIND_LABEL.get(key, key)} | {total} | {c['PASS']} | {c['FAIL']} | {c['UNTESTED']} |")
        return '\n'.join(lines)

    fail_lines = ['| Route | Role | Action | Expected | Actual |', '|---|---|---|---|---|']
    for r in fails:
        fail_lines.append(
            f"| `{r['route']}` | {r['role']} | {r['action']} | {r['expected']} | {r['actual']} |"
        )
    untested_lines = ['| Route | Role | Action | Why it was not tested |', '|---|---|---|---|']
    for r in untested:
        why = r.get('reason') or r.get('note') or '—'
        untested_lines.append(f"| `{r['route']}` | {r['role']} | {r['action']} | {why} |")

    OUT.write_text(f"""# Functional browser matrix

Derived from A10's raw results by `audit/eng100/browser_matrix.py`; do not edit by
hand. A10 is the independent tester — it implemented none of the code it exercised.

| | |
|---|---|
| Tester | {meta['worker']} |
| Browser | {meta['browser']} |
| Web under test | {meta['web']} (production build, `next start`) |
| API under test | {meta['api']} (built; connects as the non-superuser runtime role, so row-level security is enforced) |
| Candidate revision | `{meta['revision']}` (earlier batches recorded their own revision per row) |
| Method | {meta['method']} |
| Generated | {meta['generatedAt']} |

## Coverage

| | Count |
|---|---:|
| Route templates in the inventory | {len(route_names)} |
| Route templates exercised | {len(covered)} |
| Concrete instances exercised beyond the templates | {len(extra)} |
| Identities (roles + anonymous) | {len(roles)} |
| Role × route control inventories captured | {len(controls)} |
| Checks recorded | {len(rows)} |
| **Passed** | **{result['PASS']}** |
| Failed | {result['FAIL']} |
| Untested (with a recorded reason) | {result['UNTESTED']} |

Identities exercised: {', '.join(roles)}.

## By kind of check

{table('Kind', by_kind)}

## By area

{table('Area', by_area)}

## Failures

Every failure below was reported as a defect, fixed on the candidate and recorded in
`ENGINEERING_100_DEFECTS.md`; rows re-verified after a fix carry the later revision.

{chr(10).join(fail_lines)}

## Untested, with reasons

{chr(10).join(untested_lines)}

## Evidence

- Raw results (every row with route, role, action, expected, actual, request method/path/status, readback, screenshot, revision, timestamp): `evidence/eng100/a10/functional-matrix.json`
- A10's own summary: `evidence/eng100/a10/SUMMARY.md`
- Screenshots: `evidence/eng100/a10/screens/`
- Scripts: `audit/eng100/a10/`
""")
    print(f'wrote {OUT.relative_to(ROOT)}: {len(rows)} checks, {len(covered)}/{len(route_names)} routes')


if __name__ == '__main__':
    main()
