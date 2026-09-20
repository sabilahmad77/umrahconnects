// WCAG 1.4.11 (non-text contrast) and 2.5.8 (target size) measurements, taken
// from the rendered pages: control boundaries, switch tracks, focus outlines
// against the surface behind them, and the size/spacing of every target.
const L = require('./lib.cjs');
const BASE = process.env.BASE || 'http://localhost:3411';
const OUT = process.argv[2] || 'nontext.json';

const PAGES = [
  ['anonymous', '/login'],
  ['anonymous', '/signup'],
  ['anonymous', '/contact'],
  ['travelerA', '/settings'],
  ['travelerA', '/requests'],
  ['operatorAdminA', '/pilgrims'],
  ['operatorAdminA', '/bookings'],
  ['financeA', '/finance'],
  ['superAdmin', '/admin-users'],
];

const PROBE = () => {
  const parse = (colour) => {
    const m = /rgba?\(([^)]+)\)/.exec(colour);
    if (!m) return null;
    const [r, g, b, a = '1'] = m[1].split(',').map((v) => parseFloat(v));
    return { r, g, b, a: Number(a) };
  };
  const over = (front, back) =>
    front.a >= 1 ? front : { r: front.r * front.a + back.r * (1 - front.a), g: front.g * front.a + back.g * (1 - front.a), b: front.b * front.a + back.b * (1 - front.a), a: 1 };
  const lum = ({ r, g, b }) => {
    const f = [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
  };
  const surfaceBehind = (el) => {
    let node = el.parentElement;
    let colour = { r: 255, g: 255, b: 255, a: 1 };
    while (node) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) return over(bg, colour);
      node = node.parentElement;
    }
    return colour;
  };
  const describe = (el) => `${el.tagName.toLowerCase()}${el.type ? `[type=${el.type}]` : ''}${el.id ? `#${el.id}` : ''}`;

  const boundaries = [];
  for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea, [role="switch"], [role="checkbox"]')) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const behind = surfaceBehind(el);
    const own = parse(cs.backgroundColor);
    const filled = own && own.a > 0 ? over(own, behind) : behind;
    let border = parse(cs.borderTopColor);
    let hasBorder = parseFloat(cs.borderTopWidth) > 0 && border && border.a > 0;
    // A field with no border of its own is bounded by the wrapper that draws one
    // (the search chips): that wrapper is the boundary the user sees.
    if (!hasBorder) {
      for (let n = el.parentElement, depth = 0; n && depth < 3; n = n.parentElement, depth++) {
        const ws = getComputedStyle(n);
        const wb = parse(ws.borderTopColor);
        if (parseFloat(ws.borderTopWidth) > 0 && wb && wb.a > 0) { border = wb; hasBorder = true; break; }
      }
    }
    const nativeControl = ['checkbox', 'radio', 'file', 'color', 'range', 'date'].includes(el.type);
    boundaries.push({
      what: describe(el),
      name: (el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.placeholder || '').trim().slice(0, 40),
      nativeControl,
      cls: String(el.className || '').slice(0, 120),
      borderWidth: cs.borderTopWidth,
      borderVsSurface: hasBorder ? contrast(over(border, behind), behind) : null,
      borderVsField: hasBorder ? contrast(over(border, filled), filled) : null,
      fieldVsSurface: contrast(filled, behind),
    });
  }
  // Focus outline against the surface behind the focused element.
  const outlines = [];
  for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [tabindex="0"]')) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    el.focus();
    const cs = getComputedStyle(el);
    const colour = parse(cs.outlineColor);
    const width = parseFloat(cs.outlineWidth);
    const visible = cs.outlineStyle !== 'none' && width > 0 && colour && colour.a > 0;
    const behind = surfaceBehind(el);
    outlines.push({
      what: describe(el),
      name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34),
      visible,
      width: cs.outlineWidth,
      contrast: visible ? contrast(over(colour, behind), behind) : null,
    });
    el.blur();
  }
  // Target size (2.5.8): 24×24 CSS px, or spacing that keeps 24px circles apart.
  const targets = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="switch"]')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0);
  const small = [];
  for (const { el, r } of targets) {
    if (r.width >= 24 && r.height >= 24) continue;
    const inlineInText = el.tagName === 'A' && getComputedStyle(el).display.includes('inline') && el.parentElement && (el.parentElement.textContent || '').trim().length > (el.textContent || '').trim().length;
    // Spacing exception: no other target's 24px circle may overlap this one's.
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const crowded = targets.some(({ el: other, r: o }) => other !== el && Math.hypot(o.left + o.width / 2 - cx, o.top + o.height / 2 - cy) < 24);
    small.push({
      what: describe(el),
      name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34),
      size: [Math.round(r.width), Math.round(r.height)],
      inlineInText,
      crowded,
      fails: !inlineInText && crowded,
    });
  }
  return { boundaries, outlines, targets: targets.length, small };
};

(async () => {
  const browser = await L.launch();
  const report = [];
  let context = null;
  let page = null;
  let who = null;
  for (const [identity, route] of PAGES) {
    if (identity !== who) {
      if (context) await context.close();
      context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      page = await context.newPage();
      if (identity !== 'anonymous') await L.login(page, BASE, identity);
      who = identity;
    }
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await L.settle(page);
    // Transitions animate outline-width/colour, so a style read straight after
    // focus would catch the ring mid-flight; turn them off for the measurement.
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none !important;animation:none !important}' });
    await page.waitForTimeout(200);
    const data = await page.evaluate(PROBE);
    const lowBoundary = data.boundaries.filter((b) => !b.nativeControl && Math.max(b.borderVsSurface ?? 0, b.borderVsField ?? 0, b.fieldVsSurface ?? 0) < 3);
    const lowOutline = data.outlines.filter((o) => o.visible && o.contrast !== null && o.contrast < 3);
    const noOutline = data.outlines.filter((o) => !o.visible);
    const smallTargets = data.small.filter((s) => s.fails);
    report.push({ identity, route, controls: data.boundaries.length, lowBoundary, focusable: data.outlines.length, lowOutline, noOutline, targets: data.targets, small: data.small.length, smallTargets });
    console.log(
      `${identity.padEnd(15)} ${route.padEnd(16)} controls=${data.boundaries.length} boundary<3:1=${lowBoundary.length} outline<3:1=${lowOutline.length} no-outline=${noOutline.length} targets=${data.targets} under24=${data.small.length} failing=${smallTargets.length}`,
    );
  }
  if (context) await context.close();
  await browser.close();
  L.writeJson(OUT, { base: BASE, when: new Date().toISOString(), report });
})();
