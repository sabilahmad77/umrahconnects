"""Build the axe evidence summary (before vs after) for the W31 record."""
import json
import sys
from collections import defaultdict

src = '/var/folders/_0/47h8wgqx27199q4s8_0c9r_c0000gn/T/uc-a11/'
before = json.load(open(src + 'axe-before.json'))
after = json.load(open(src + 'axe-after.json'))

CRITERION = {
    '1.1.1': 'Non-text content', '1.3.1': 'Info and relationships', '1.3.5': 'Identify input purpose',
    '1.4.3': 'Contrast (minimum)', '1.4.4': 'Resize text', '1.4.10': 'Reflow', '1.4.11': 'Non-text contrast',
    '2.1.1': 'Keyboard', '2.1.2': 'No keyboard trap', '2.1.3': 'Keyboard (no exception)', '2.4.1': 'Bypass blocks',
    '2.4.3': 'Focus order', '2.4.7': 'Focus visible', '2.4.11': 'Focus not obscured (minimum)',
    '2.5.8': 'Target size (minimum)', '3.3.1': 'Error identification', '3.3.8': 'Accessible authentication',
    '4.1.2': 'Name, role, value', '4.1.3': 'Status messages',
}


def table(run, best_practice):
    rows = []
    for s in run['summary']:
        if bool(s['bestPractice']) != best_practice:
            continue
        rows.append(s)
    return sorted(rows, key=lambda s: -s['nodes'])


def counts(run):
    wcag = [s for s in run['summary'] if not s['bestPractice']]
    bp = [s for s in run['summary'] if s['bestPractice']]
    serious = sum(s['nodes'] for s in wcag if s['impact'] in ('serious', 'critical'))
    return {
        'states': run['runs'],
        'wcag_rules': len(wcag),
        'wcag_instances': sum(s['instances'] for s in wcag),
        'wcag_nodes': sum(s['nodes'] for s in wcag),
        'serious_nodes': serious,
        'bp_rules': len(bp),
        'bp_nodes': sum(s['nodes'] for s in bp),
    }


out = []
out.append('# Automated WCAG audit — axe-core sweep (W31)\n')
out.append(f"Tool: {after['tool']}, tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa` "
           "(best-practice rules are run too and reported separately — they are not WCAG failures).\n")
out.append('Coverage: every route under `apps/web/app` for every role that can open it, plus the page state after '
           'opening each tab panel, each creation dialog the page offers, the account menu, the notification popover, '
           'the mobile navigation drawer, the public header menus, and one access-denied state. '
           'Routes a role may not open are recorded as denied rather than audited.\n')
b, a = counts(before), counts(after)
out.append('| | audited states | WCAG rules violated | violation instances | failing nodes | serious/critical nodes | best-practice rules | best-practice nodes |')
out.append('|---|---|---|---|---|---|---|---|')
out.append(f"| Before (candidate code) | {b['states']} | {b['wcag_rules']} | {b['wcag_instances']} | {b['wcag_nodes']} | {b['serious_nodes']} | {b['bp_rules']} | {b['bp_nodes']} |")
out.append(f"| After (this branch) | {a['states']} | {a['wcag_rules']} | {a['wcag_instances']} | {a['wcag_nodes']} | {a['serious_nodes']} | {a['bp_rules']} | {a['bp_nodes']} |")
out.append('')

out.append('## WCAG violations before the fixes\n')
out.append('| Rule | Impact | Success criterion | instances | nodes | Where (sample) | Fix |')
out.append('|---|---|---|---|---|---|---|')
FIX = {
    'color-contrast': 'gold-700 → gold-800 on gold-50; red-600 → red-700 on red-50/100; white on green-600 → green-700',
    'aria-hidden-focus': 'the account menu is no longer a modal Radix menu, so the workspace is not marked aria-hidden while it is open',
    'svg-img-alt': 'charts are marked decorative and their numbers published as a visually hidden list',
    'aria-prohibited-attr': 'star ratings carry role="img" (aria-label is prohibited on a bare span)',
    'scrollable-region-focusable': 'the workspace main region takes tabindex=0 while it scrolls and holds nothing focusable (committed after this state was measured; re-checked separately in axe-after-reports.json)',
}
for s in table(before, False):
    sc = ', '.join(f"{c} {CRITERION.get(c, '')}".strip() for c in s['wcag'])
    out.append(f"| `{s['id']}` | {s['impact']} | {sc} | {s['instances']} | {s['nodes']} | {s['where'][0]} | {FIX.get(s['id'], '')} |")
out.append('')

after_wcag = table(after, False)
out.append('## WCAG violations after the fixes\n')
if not after_wcag:
    out.append('None. Zero violations of any rule in the five WCAG tag sets, over every audited state.\n')
else:
    out.append('| Rule | Impact | Success criterion | instances | nodes | Where | Why it remains |')
    out.append('|---|---|---|---|---|---|---|')
    for s in after_wcag:
        sc = ', '.join(f"{c} {CRITERION.get(c, '')}".strip() for c in s['wcag'])
        out.append(f"| `{s['id']}` | {s['impact']} | {sc} | {s['instances']} | {s['nodes']} | {'; '.join(s['where'][:3])} | {FIX.get(s['id'], '')} |")
    out.append('')

out.append('## Best-practice rules (not WCAG failures)\n')
out.append('| Rule | Impact | before nodes | after nodes | Note |')
out.append('|---|---|---|---|---|')
bp_before = {s['id']: s for s in table(before, True)}
bp_after = {s['id']: s for s in table(after, True)}
NOTE = {
    'heading-order': 'section headings under the page <h1> lifted from <h3> to <h2>',
    'region': 'content outside a landmark — the reset-password card now sits in <main>',
    'landmark-one-main': 'reset-password had no <main>; the remainder are states where a modal dialog hides the page from assistive technology, which is what a modal is meant to do',
    'page-has-heading-one': 'states measured while a modal dialog is open (the page behind it is hidden)',
    'aria-dialog-name': 'the notification popover now has aria-label="Notifications"',
    'empty-table-header': 'the action column header carries a visually hidden "Actions"',
    'landmark-unique': 'the inner scrollable table region is now named "… table"',
    'aria-allowed-attr': '',
}
for rule in sorted(set(bp_before) | set(bp_after)):
    b_nodes = bp_before.get(rule, {}).get('nodes', 0)
    a_nodes = bp_after.get(rule, {}).get('nodes', 0)
    impact = (bp_after.get(rule) or bp_before.get(rule))['impact']
    out.append(f"| `{rule}` | {impact} | {b_nodes} | {a_nodes} | {NOTE.get(rule, '')} |")
out.append('')

out.append('## Coverage by identity\n')
out.append('| Identity | role | audited states | routes audited | routes denied | dynamic routes with no instance to open |')
out.append('|---|---|---|---|---|---|')
ROLE = {
    'anonymous': 'signed out (public pages)', 'travelerA': 'PILGRIM', 'operatorAdminA': 'OPERATOR_ADMIN',
    'operatorStaffA': 'OPERATOR_STAFF', 'financeA': 'FINANCE_MANAGER', 'hotelA': 'HOTEL_MANAGER',
    'transportA': 'TRANSPORT_MANAGER', 'visaA': 'VISA_OFFICER', 'superAdmin': 'SUPER_ADMIN',
    'travelerUnverified': 'PILGRIM, email not verified', 'travelerOnboarding': 'PILGRIM, no organization yet',
}
states = defaultdict(int)
for r in after['results']:
    states[r['identity']] += 1
for key, cov in after['coverage'].items():
    out.append(f"| {key} | {ROLE.get(key, '')} | {states[key]} | {len(cov.get('audited', []))} | {len(cov.get('denied', []))} | {len(cov.get('dynamicMissing', []))} |")
out.append('')
out.append('Raw results: `axe-before.json`, `axe-after.json` (every violation with its rule, criterion, impact, route, '
           'state and node targets); console logs in `axe-before.log` and `axe-after.log`.\n')

open('/Users/macbook/Projects/umrah-connects-eng100/a11/docs/control-tower/evidence/eng100/a11/axe/SUMMARY.md', 'w').write('\n'.join(out))
print('\n'.join(out[:12]))
print('after WCAG rules:', [s['id'] for s in after_wcag])
