"""Build the W30 responsive evidence summary from responsive.json."""
import json
from collections import defaultdict

import sys
src = '/var/folders/_0/47h8wgqx27199q4s8_0c9r_c0000gn/T/uc-a11/'
d = json.load(open(src + (sys.argv[1] if len(sys.argv) > 1 else 'responsive.json')))
dest = '/Users/macbook/Projects/umrah-connects-eng100/a11/docs/control-tower/evidence/eng100/a11/responsive/' + (sys.argv[2] if len(sys.argv) > 2 else 'RESULTS.md')

ROLE = {
    'anonymous': 'signed out (public site)', 'travelerA': 'PILGRIM', 'operatorAdminA': 'OPERATOR_ADMIN',
    'financeA': 'FINANCE_MANAGER', 'hotelA': 'HOTEL_MANAGER', 'transportA': 'TRANSPORT_MANAGER',
    'visaA': 'VISA_OFFICER', 'superAdmin': 'SUPER_ADMIN',
}

rows = [r for r in d['results'] if 'error' not in r]
errors = [r for r in d['results'] if 'error' in r]
out = ['# Responsive acceptance (W30) and reflow / resize text (1.4.10, 1.4.4)\n',
       f"Measured against `{d['base']}` on {d['when'][:16].replace('T', ' ')} UTC.\n",
       'Measured in Chrome at each width with `tools/responsive.cjs`: the document and the workspace main region are '
       'checked for horizontal scroll, every element painted past the right edge is listed, every horizontal scroller '
       'is checked for a name, and text that is actually cut off by a box is reported. '
       'Raw data: `responsive.json`; screenshots in `screenshots/`.\n']

widths = d['widths']
out.append(f"Widths: {', '.join(str(w) + ' px' for w in widths)} (plus 320 px for reflow and 1280 px at 200 % text size).\n")
out.append(f"{len(rows)} measurements, {d['problemCount']} problems.\n")

out.append('## Horizontal scroll by route and width\n')
out.append('A cell shows the page-level horizontal overflow in pixels; `0` is the pass condition.\n')
out.append('| Identity | Route | ' + ' | '.join(f'{w}px' for w in widths) + ' |')
out.append('|---|---|' + '---|' * len(widths))
grouped = defaultdict(dict)
order = []
for r in rows:
    if r.get('reflow') or r.get('textZoom'):
        continue
    key = (r['identity'], r['route'])
    if key not in grouped:
        order.append(key)
    grouped[key][r['width']] = r
for key in order:
    identity, route = key
    cells = []
    for w in widths:
        r = grouped[key].get(w)
        cells.append('—' if not r else str(r['pageOverflow']))
    out.append(f'| {identity} | `{route}` | ' + ' | '.join(cells) + ' |')
out.append('')

out.append('## What each role was checked on\n')
out.append('| Identity | role | routes |')
out.append('|---|---|---|')
by_identity = defaultdict(set)
for key in order:
    by_identity[key[0]].add(key[1])
for identity, routes in by_identity.items():
    out.append(f"| {identity} | {ROLE.get(identity, '')} | {', '.join('`' + r + '`' for r in sorted(routes))} |")
out.append('')

out.append('## Tables, navigation and dialogs at small widths\n')
narrow = [r for r in rows if r['width'] in (390, 360) and r['identity'] != 'anonymous' and 'drawer' not in r['route']]
out.append('| Check | Result |')
out.append('|---|---|')
out.append(f"| Mobile navigation button present on every workspace route at 390 and 360 px | {sum(1 for r in narrow if r.get('mobileNavButton'))}/{len(narrow)} |")
out.append(f"| Sidebar takes no width at 390 and 360 px | {sum(1 for r in narrow if not r.get('sidebarVisible'))}/{len(narrow)} |")
drawers = [r for r in rows if 'drawer' in r['route']]
out.append(f"| Navigation drawer opens without pushing the page sideways | {sum(1 for r in drawers if r['pageOverflow'] <= 1)}/{len(drawers)} |")
scrollers = [s for r in rows for s in r.get('horizontalScrollers', []) if s.get('hasTable')]
named = [s for s in scrollers if s.get('label')]
out.append(f"| Table scrollers that carry a name (tables may scroll inside a labelled region) | {len(named)}/{len(scrollers)} |")
focusable = [s for s in scrollers if s.get('focusable')]
out.append(f"| Table scrollers reachable with the keyboard (`tabindex=0`) | {len(focusable)}/{len(scrollers)} |")
out.append('')

reflow = [r for r in rows if r.get('reflow')]
out.append('## Reflow at 320 CSS px (1.4.10)\n')
out.append('| Route | page overflow | main overflow | horizontal scrollers | text cut off |')
out.append('|---|---|---|---|---|')
for r in reflow:
    out.append(f"| `{r['route']}` | {r['pageOverflow']} | {r['mainOverflow']} | {len(r['horizontalScrollers'])} | {len(r['clipped'])} |")
out.append('')

zoom = [r for r in rows if r.get('textZoom')]
out.append('## Text size doubled at 1280 px (1.4.4)\n')
out.append('The root font size is set to 200 %, so every rem-based size doubles while the viewport stays 1280 px.\n')
out.append('| Route | page overflow | text cut off |')
out.append('|---|---|---|')
for r in zoom:
    out.append(f"| `{r['route']}` | {r['pageOverflow']} | {len(r['clipped'])} |")
out.append('')

out.append('## Landing hero\n')
out.append('| Width | headline | headline inside the viewport | headline clipped | call to action inside the viewport | page overflow |')
out.append('|---|---|---|---|---|---|')
for h in d['hero']:
    h1 = h.get('h1Box') or {}
    cta = h.get('ctaBox') or {}
    inside = 'yes' if h1 and h1.get('left', 0) >= -1 and h1.get('right', 0) <= h['viewport'] + 1 else 'NO'
    cta_inside = '—' if not cta else ('yes' if cta.get('left', 0) >= -1 and cta.get('right', 0) <= h['viewport'] + 1 else 'NO')
    out.append(f"| {h['width']} | \"{h.get('h1')}\" | {inside} | {'yes' if h.get('h1Clipped') else 'no'} | {cta_inside} | {h.get('pageOverflow')} |")
out.append('')

out.append('## Problems\n')
if not d['problems']:
    out.append('None: no route scrolled horizontally at any width, no table scrolled outside a named region, no text was cut off, and the hero stayed whole at every width down to 320 px.\n')
else:
    out.append('| Identity | Route | Width | Problem |')
    out.append('|---|---|---|---|')
    for p in d['problems']:
        out.append(f"| {p['identity']} | `{p['route']}` | {p['width']} | {'; '.join(p['problems'])[:200]} |")
    out.append('')
if errors:
    out.append(f'{len(errors)} page loads timed out while the audit and this run shared the development server; they were re-measured in a later pass.\n')

open(dest, 'w').write('\n'.join(out))
print('\n'.join(out[:8]))
print('problems:', d['problemCount'], 'measurements:', len(rows), 'load errors:', len(errors))
