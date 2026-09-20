// axe-core crawl of every route, per role, including dialogs, menus and tabs.
// Usage: BASE=http://localhost:3411 ONLY=travelerA,superAdmin node audit.cjs out.json
const L = require('./lib.cjs');

const BASE = process.env.BASE || 'http://localhost:3411';
const OUT = process.argv[2] || 'axe.json';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const ROUTE_FILTER = process.env.ROUTES ? process.env.ROUTES.split(',') : null;
const SKIP_EXTRAS = process.env.SKIP_EXTRAS === '1';

const IDENTITIES = [
  'anonymous',
  'travelerA',
  'operatorAdminA',
  'operatorStaffA',
  'financeA',
  'hotelA',
  'transportA',
  'visaA',
  'superAdmin',
  'travelerUnverified',
  'travelerOnboarding',
];
// Accounts that only add one distinct state; the rest of their pages equal travelerA's.
const LIMITED = {
  travelerUnverified: ['/travel-plan', '/settings', '/notifications'],
  travelerOnboarding: ['/onboarding', '/settings'],
};
// Buttons that open a creation/edit dialog or page without changing data.
const OPENER = /^(new|add|create|invite|record|upload|register|issue|compose|write|edit)\b/i;
const NEVER_CLICK = /(connection|connect|member to|to group|to cart|remove|delete|cancel|approve|reject|publish|archive|send|pay|confirm|submit|accept|decline|block)/i;

const inventory = L.routeInventory();
const dashboardStatic = inventory.filter((r) => r.dashboard && !L.isDynamic(r.pattern)).map((r) => r.pattern);
const dashboardDynamic = inventory.filter((r) => r.dashboard && L.isDynamic(r.pattern)).map((r) => r.pattern);
const publicStatic = inventory.filter((r) => !r.dashboard && !L.isDynamic(r.pattern)).map((r) => r.pattern);
const publicDynamic = inventory.filter((r) => !r.dashboard && L.isDynamic(r.pattern)).map((r) => r.pattern);

const results = [];
const coverage = {};
let deniedAudited = false;

function record(entry) {
  results.push(entry);
  const v = entry.violations || [];
  const serious = v.filter((x) => !x.bestPractice && (x.impact === 'serious' || x.impact === 'critical')).length;
  console.log(
    `${entry.identity.padEnd(18)} ${entry.state.padEnd(22)} ${entry.route.padEnd(30)} wcag=${v.filter((x) => !x.bestPractice).length} serious+=${serious} bp=${v.filter((x) => x.bestPractice).length}`,
  );
}

async function audit(page, meta, opts = {}) {
  try {
    const res = await L.runAxe(page, { bestPractice: true, ...opts });
    record({ ...meta, url: new URL(page.url()).pathname, ...res });
  } catch (e) {
    record({ ...meta, url: page.url(), error: String(e).slice(0, 300), violations: [], incomplete: [] });
  }
}

async function collectHrefs(page) {
  return page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h && h.startsWith('/')));
}

async function tabs(page, meta) {
  const count = await page.locator('main [role="tab"]').count();
  for (let i = 0; i < Math.min(count, 6); i++) {
    const tab = page.locator('main [role="tab"]').nth(i);
    if ((await tab.getAttribute('aria-selected')) === 'true') continue;
    if (!(await tab.isVisible().catch(() => false)) || (await tab.isDisabled().catch(() => true))) continue;
    const name = ((await tab.textContent()) || '').trim().slice(0, 40);
    await tab.click().catch(() => {});
    await L.settle(page, { timeout: 6000 });
    await audit(page, { ...meta, state: `tab:${name}` }, { include: [['main']] });
  }
}

async function dialogs(page, meta, route) {
  const candidates = await page.evaluate(
    ({ opener, never }) => {
      const re = new RegExp(opener, 'i');
      const no = new RegExp(never, 'i');
      return [...document.querySelectorAll('main button, main a[role="button"]')]
        .map((b, index) => ({ index, name: (b.getAttribute('aria-label') || b.textContent || '').trim(), type: b.getAttribute('type'), inForm: !!b.closest('form'), disabled: b.disabled }))
        .filter((b) => re.test(b.name) && !no.test(b.name) && b.type !== 'submit' && !b.inForm && !b.disabled);
    },
    { opener: OPENER.source, never: NEVER_CLICK.source },
  );
  for (const cand of candidates.slice(0, 2)) {
    const before = page.url();
    const button = page.locator('main button, main a[role="button"]').nth(cand.index);
    if (!(await button.isVisible().catch(() => false))) continue;
    await button.click().catch(() => {});
    await page.waitForTimeout(900);
    if (page.url() !== before) {
      await L.settle(page);
      await audit(page, { ...meta, state: `opened-page:${cand.name.slice(0, 30)}` });
      await page.goto(before, { waitUntil: 'domcontentloaded' });
      await L.settle(page);
      continue;
    }
    const dialog = page.locator('[role="dialog"], [role="alertdialog"]').first();
    if (await dialog.isVisible().catch(() => false)) {
      await L.settle(page, { timeout: 5000 });
      await audit(page, { ...meta, state: `dialog:${cand.name.slice(0, 30)}` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      if (await dialog.isVisible().catch(() => false)) {
        // Some surfaces close only through their own button.
        await page.locator('[role="dialog"] button[aria-label^="Close"], [role="dialog"] button:has-text("Cancel")').first().click().catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  }
}

async function menus(page, meta) {
  // Account menu (Radix dropdown) and notification popover in the header.
  for (const [label, state] of [
    ['Account menu', 'menu:account'],
    ['Notifications', 'menu:notifications'],
  ]) {
    const trigger = page.locator(`header button[aria-label^="${label}"]`).first();
    if (!(await trigger.isVisible().catch(() => false))) continue;
    await trigger.click();
    await page.waitForTimeout(700);
    await L.settle(page, { timeout: 5000 });
    await audit(page, { ...meta, state });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  // Mobile navigation drawer.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const open = page.locator('header button[aria-label="Open workspace navigation"], header button[aria-label="Open navigation"]').first();
  if (await open.isVisible().catch(() => false)) {
    await open.click();
    await page.waitForTimeout(700);
    await audit(page, { ...meta, state: 'menu:mobile-navigation' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(300);
}

async function publicMenus(page, meta) {
  for (const label of ['Solutions', 'Resources']) {
    // The public header menus are <details>/<summary> disclosures.
    const trigger = page.locator(`header nav summary:has-text("${label}"), header nav button:has-text("${label}")`).first();
    if (!(await trigger.isVisible().catch(() => false))) continue;
    await trigger.click();
    await page.waitForTimeout(500);
    await audit(page, { ...meta, state: `menu:${label.toLowerCase()}` });
    await trigger.click().catch(() => {});
    await page.waitForTimeout(300);
  }
  await menus(page, meta);
}

async function runIdentity(browser, key) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const cov = (coverage[key] = { audited: [], denied: [], redirected: {}, dynamicMissing: [] });
  const seen = new Set();
  const hrefs = new Set();
  let landing = null;
  if (key !== 'anonymous') landing = await L.login(page, BASE, key);
  cov.landing = landing;
  const statics = key === 'anonymous' ? publicStatic : LIMITED[key] || dashboardStatic;
  const dynamics = key === 'anonymous' ? publicDynamic : LIMITED[key] ? [] : dashboardDynamic;

  const visit = async (route, url) => {
    if (ROUTE_FILTER && !ROUTE_FILTER.some((r) => route === r || route.startsWith(r))) return;
    const meta = { identity: key, route, viewport: '1280x900' };
    try {
      await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
      record({ ...meta, state: 'page', url, error: String(e).slice(0, 200), violations: [], incomplete: [] });
      return;
    }
    await L.settle(page);
    const finalPath = new URL(page.url()).pathname;
    if (await page.locator('[data-access="denied"]').count()) {
      cov.denied.push(route);
      if (!deniedAudited) {
        deniedAudited = true;
        await audit(page, { ...meta, state: 'access-denied' });
      }
      return;
    }
    if (finalPath !== url.split('?')[0]) {
      cov.redirected[route] = finalPath;
      if (seen.has(finalPath)) return;
    }
    seen.add(finalPath);
    cov.audited.push(route);
    (await collectHrefs(page)).forEach((h) => hrefs.add(h.split(/[?#]/)[0]));
    await audit(page, { ...meta, state: 'page' });
    if (SKIP_EXTRAS) return;
    await tabs(page, meta);
    await dialogs(page, meta, route);
  };

  for (const route of statics) await visit(route, route);
  for (const pattern of dynamics) {
    const re = L.patternRegex(pattern);
    const staticSet = new Set([...dashboardStatic, ...publicStatic]);
    const match = [...hrefs].find((h) => re.test(h) && !staticSet.has(h));
    if (!match) {
      cov.dynamicMissing.push(pattern);
      continue;
    }
    await visit(pattern, match);
  }
  if ((!ROUTE_FILTER || process.env.MENUS === '1') && !SKIP_EXTRAS) {
    await page.goto(`${BASE}${key === 'anonymous' ? '/' : landing}`, { waitUntil: 'domcontentloaded' });
    await L.settle(page);
    const meta = { identity: key, route: key === 'anonymous' ? '/' : landing, viewport: '1280x900' };
    if (key === 'anonymous') await publicMenus(page, meta);
    else await menus(page, meta);
  }
  await context.close();
}

(async () => {
  const started = new Date().toISOString();
  const browser = await L.launch();
  for (const key of IDENTITIES) {
    if (ONLY && !ONLY.includes(key)) continue;
    try {
      await runIdentity(browser, key);
    } catch (e) {
      console.error(`identity ${key} failed: ${String(e).slice(0, 300)}`);
      coverage[key] = { ...(coverage[key] || {}), error: String(e).slice(0, 300) };
    }
  }
  await browser.close();
  // Summary by rule (distinct route/state instances and node totals).
  const byRule = {};
  for (const r of results)
    for (const v of r.violations) {
      const s = (byRule[v.id] ||= { id: v.id, impact: v.impact, wcag: v.wcag, bestPractice: v.bestPractice, help: v.help, instances: 0, nodes: 0, where: [] });
      s.instances++;
      s.nodes += v.nodeCount;
      if (s.where.length < 60) s.where.push(`${r.identity} ${r.route} [${r.state}]`);
    }
  const summary = Object.values(byRule).sort((a, b) => b.nodes - a.nodes);
  L.writeJson(OUT, {
    tool: `axe-core ${L.AXE_VERSION}`,
    tags: [...L.WCAG_TAGS, 'best-practice (reported separately)'],
    base: BASE,
    started,
    finished: new Date().toISOString(),
    runs: results.length,
    coverage,
    summary,
    results,
  });
  const wcag = summary.filter((s) => !s.bestPractice);
  console.log('\nWCAG rules violated:', wcag.map((s) => `${s.id}(${s.impact}) inst=${s.instances} nodes=${s.nodes}`).join('\n  '));
  console.log('Best-practice rules:', summary.filter((s) => s.bestPractice).map((s) => `${s.id}(${s.impact}) inst=${s.instances}`).join(', '));
})();
