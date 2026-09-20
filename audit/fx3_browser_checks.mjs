/**
 * FX3 browser proofs for the two findings that are only real in a browser.
 *
 *  1. N-FORM-1 / A12-1 — two real tabs, one account, the SAME "Add pilgrim" form
 *     submitted in both: exactly one pilgrim record exists afterwards.
 *  2. A12-5 — a HOTEL_MANAGER opening a listing it does not own: no failed
 *     request and no console error during the page load.
 *
 * Real Chrome, real /login form, no injected tokens. Run:
 *   node audit/fx3_browser_checks.mjs <webOrigin> <outputJson>
 */
import { chromium } from '/Users/macbook/Projects/umrah-connects/audit/node_modules/playwright-core/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const WEB = process.argv[2] ?? 'http://localhost:3423';
const OUT = process.argv[3] ?? 'docs/control-tower/evidence/fx3-browser-checks.json';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CREDENTIALS = '/Users/macbook/Projects/umrah-connects-integration/.project/local/qa-credentials.json';

const identities = JSON.parse(readFileSync(CREDENTIALS, 'utf8')).identities;
const identity = (key) => {
  const found = identities.find((i) => i.key === key);
  if (!found) throw new Error(`No QA identity "${key}"`);
  return found;
};

const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};

/** A fresh browser context, signed in through the real form. Returns the context. */
async function signIn(browser, key) {
  const who = identity(key);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  // Fill only once React has hydrated: these are controlled inputs, and a value
  // typed before hydration is wiped by the first render.
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 45_000 });
  await page.waitForTimeout(800);
  await page.fill('#signin-email', who.email);
  await page.fill('#signin-password', who.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1_200);
  return { context, page, who };
}

/** Fill the "Add pilgrim" modal with the same values in whichever tab is given. */
async function fillPilgrimForm(page, firstName, lastName, passport) {
  await page.goto(`${WEB}/pilgrims`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Add Pilgrim', { timeout: 45_000 });
  await page.click('text=Add Pilgrim');
  await page.waitForSelector('[aria-label="First Name"]', { timeout: 20_000 });
  await page.fill('[aria-label="First Name"]', firstName);
  await page.fill('[aria-label="Last Name"]', lastName);
  await page.fill('[aria-label="Passport Number"]', passport);
}

async function twoTabsOneRecord(browser) {
  const { context, page: tabA, who } = await signIn(browser, 'operatorAdminA');
  const tabB = await context.newPage(); // a second REAL tab of the same session
  const lastName = `Duplicate-${stamp}`;
  const passport = `FX3${stamp}`;

  const sent = [];
  for (const [label, page] of [['A', tabA], ['B', tabB]]) {
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/proxy-api/pilgrims')) {
        sent.push({ tab: label, key: r.headers()['idempotency-key'] ?? null });
      }
    });
  }

  await fillPilgrimForm(tabA, 'Two', lastName, passport);
  await fillPilgrimForm(tabB, 'Two', lastName, passport);
  // Both tabs submit the same form, as a person switching tabs would. The button
  // is the one INSIDE the dialog (the toolbar has one with the same words).
  const save = (page) => page.locator('[role="dialog"] button', { hasText: /^Add pilgrim$/ }).click();
  await Promise.all([save(tabA), save(tabB)]);
  await tabA.waitForTimeout(3_000);

  // Count through the API as the signed-in operator (its own organization only).
  const found = await tabA.evaluate(async (q) => {
    const res = await fetch(`/proxy-api/pilgrims?search=${encodeURIComponent(q)}&limit=50`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem('accessToken') ?? ''}` },
      credentials: 'include',
    });
    const body = await res.json();
    const items = body?.data?.items ?? body?.data ?? [];
    return items.map((p) => p.id);
  }, passport);

  const uniqueIds = [...new Set(found)];
  const keys = [...new Set(sent.map((s) => s.key))];
  record(
    'N-FORM-1: two tabs, same account, same form → one pilgrim',
    uniqueIds.length === 1 && sent.length === 2 && keys.length === 1 && !!keys[0],
    `${sent.length} POST /pilgrims from ${sent.map((s) => s.tab).join('+')}, ` +
      `${keys.length} distinct Idempotency-Key, ${uniqueIds.length} record(s) for passport ${passport}`,
  );
  await context.close();
  return { sent, uniqueIds, passport };
}

async function hotelManagerViewsForeignListing(browser) {
  // A published listing that belongs to somebody other than hotel A.
  const probe = await fetch(`${WEB}/proxy-api/marketplace/listings?limit=50`).then((r) => r.json());
  const catalogue = probe?.data?.items ?? [];
  if (!catalogue.length) throw new Error('No published listings in the catalogue to view');

  const { context, page, who } = await signIn(browser, 'hotelA');
  const failures = [];
  const consoleErrors = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/proxy-api/')) failures.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 200)));

  // Which of the catalogue listings are NOT this account's own?
  const mine = await page.evaluate(async () => {
    const res = await fetch('/proxy-api/marketplace/listings/mine?limit=100', {
      headers: { Authorization: `Bearer ${sessionStorage.getItem('accessToken') ?? ''}` },
      credentials: 'include',
    });
    const body = await res.json();
    return (body?.data?.items ?? []).map((l) => l.id);
  });
  const foreign = catalogue.filter((l) => !mine.includes(l.id)).slice(0, 3);
  if (!foreign.length) throw new Error('Every published listing belongs to hotel A — cannot test the non-owner path');

  failures.length = 0;
  consoleErrors.length = 0;
  const viewed = [];
  for (const listing of foreign) {
    await page.goto(`${WEB}/marketplace/${listing.id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const heading = await page.locator('h1').first().textContent().catch(() => null);
    viewed.push({ id: listing.id, heading: (heading ?? '').trim().slice(0, 60) });
  }
  record(
    'A12-5: hotel manager opens listings it does not own — no failed request, no console error',
    failures.length === 0 && consoleErrors.length === 0 && viewed.every((v) => v.heading.length > 0),
    `${viewed.length} foreign listing(s) opened as ${who.role}; failed /proxy-api requests: ` +
      `${failures.length ? failures.join(', ') : 'none'}; console errors: ${consoleErrors.length ? consoleErrors.join(' | ') : 'none'}`,
  );

  // And the owner still gets the seller view on the same route.
  const ownerCheck = await (async () => {
    const owner = await signIn(browser, 'hotelB');
    const ownFailures = [];
    owner.page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/proxy-api/')) ownFailures.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    const own = await owner.page.evaluate(async () => {
      const res = await fetch('/proxy-api/marketplace/listings/mine?limit=1', {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('accessToken') ?? ''}` },
        credentials: 'include',
      });
      const body = await res.json();
      return (body?.data?.items ?? [])[0]?.id ?? null;
    });
    if (!own) {
      await owner.context.close();
      return { skipped: 'hotel B owns no listing' };
    }
    await owner.page.goto(`${WEB}/marketplace/${own}`, { waitUntil: 'networkidle' });
    await owner.page.waitForTimeout(800);
    const sellerTabs = await owner.page.locator('text=Inquiries').count();
    await owner.context.close();
    return { own, sellerTabs, failures: ownFailures };
  })();
  record(
    'A12-5: the owner still gets the seller view from the same route',
    !ownerCheck.skipped && ownerCheck.sellerTabs > 0 && ownerCheck.failures.length === 0,
    ownerCheck.skipped ?? `listing ${ownerCheck.own}: seller tabs ${ownerCheck.sellerTabs}, failed requests: ${ownerCheck.failures.join(', ') || 'none'}`,
  );

  await context.close();
}

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
try {
  await twoTabsOneRecord(browser);
  await hotelManagerViewsForeignListing(browser);
} finally {
  await browser.close();
}
writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), web: WEB, stamp, results }, null, 2));
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed → ${OUT}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
