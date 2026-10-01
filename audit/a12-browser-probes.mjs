/**
 * A12 independent acceptance — browser probes.
 *
 * Real Chrome through playwright-core against the COLD-BOOTED production
 * artifacts (web `next start`, API `node dist/src/main`), signing in through the
 * real /login form. One browser context per identity and per tab, so nothing is
 * shared that a real user would not share. Credentials come from the QA fixture
 * file and are never printed.
 *
 *   A12-B1  a session revoked in one tab is refused in the other on its next action
 *   A12-B2  the duplicate-submit guard is per tab: two tabs submitting the same
 *           form at once create two records (defect A12-1, seen through the UI)
 *   A12-B3  a listing the platform took down is invisible in the marketplace
 *
 * Usage: A12_WEB=http://127.0.0.1:3413 A12_API=http://127.0.0.1:4413 node audit/a12-browser-probes.mjs
 */
import { chromium } from '/Users/macbook/Projects/umrah-connects/audit/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB = process.env.A12_WEB ?? 'http://127.0.0.1:3413';
const API = process.env.A12_API ?? 'http://127.0.0.1:4413';
const OUT = process.env.A12_OUT ?? join(process.cwd(), 'docs/control-tower/evidence/eng100/a12/browser');
const CREDS = '/Users/macbook/Projects/umrah-connects-integration/.project/local/qa-credentials.json';
mkdirSync(OUT, { recursive: true });

const identities = JSON.parse(readFileSync(CREDS, 'utf8')).identities;
const who = (key) => {
  const row = identities.find((i) => i.key === key);
  if (!row) throw new Error(`QA identity ${key} missing`);
  return row;
};

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
};

/** A fresh browser context signed in through the real form. Returns { context, page }. */
async function signIn(browser, key, label) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  const person = who(key);
  // The access token lives only in page memory (the refresh token is an httpOnly
  // cookie), so a probe request has to carry the very header the app itself sends.
  const seen = { auth: null };
  page.on('request', (req) => {
    const h = req.headers()['authorization'];
    if (h && h.startsWith('Bearer ')) seen.auth = h;
  });
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signin-email', { timeout: 30_000 });
  await page.fill('#signin-email', person.email);
  await page.fill('#signin-password', person.password);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  } catch (err) {
    const alert = await page.locator('[role="alert"]').allTextContents().catch(() => []);
    await page.screenshot({ path: join(OUT, `${label}-login-failed.png`) });
    throw new Error(`sign-in as ${key} did not leave /login — page said: ${alert.join(' | ') || '(nothing)'}`);
  }
  await page.waitForTimeout(3000); // let the workspace load and issue its first API calls
  await page.screenshot({ path: join(OUT, `${label}-signed-in.png`) });
  if (!seen.auth) throw new Error(`no Authorization header observed for ${key} after sign-in`);
  return { context, page, person, auth: () => seen.auth };
}

/** The API through the page's own session (the web proxy), as the browser would call it. */
const viaPage = (session, path, init = {}) => {
  const page = session.page ?? session;
  const auth = typeof session.auth === 'function' ? session.auth() : null;
  return page.evaluate(
    async ([p, i, bearer]) => {
      const res = await fetch(p, {
        ...i,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: bearer } : {}), ...(i.headers || {}) },
      });
      let body = null;
      try {
        body = await res.json();
      } catch {
        /* not json */
      }
      return { status: res.status, body };
    },
    [path, init, auth],
  );
};

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  try {
    // ── A12-B1: revocation reaches the other session ────────────────────────
    {
      const a = await signIn(browser, 'travelerA', 'b1-tab1');
      const b = await signIn(browser, 'travelerA', 'b1-tab2');
      const before = await viaPage(b, '/proxy-api/auth/me');
      check('A12-B1a second tab is signed in before the revocation', before.status === 200, `HTTP ${before.status}`);

      const out = await viaPage(a, '/proxy-api/auth/logout-all', { method: 'POST', body: '{}' });
      check('A12-B1b log out everywhere accepted in tab 1', out.status < 300, `HTTP ${out.status}`);

      const after = await viaPage(b, '/proxy-api/auth/me');
      check('A12-B1c the other tab is refused on its next action', after.status === 401, `HTTP ${after.status}`);

      // …and the UI sends it back to /login rather than showing stale data.
      await b.page.goto(`${WEB}/travel-plan`, { waitUntil: 'domcontentloaded' });
      await b.page.waitForTimeout(2500);
      const landed = new URL(b.page.url()).pathname;
      await b.page.screenshot({ path: join(OUT, 'b1-revoked-tab.png') });
      check('A12-B1d the revoked tab lands on the sign-in screen', landed.startsWith('/login'), `at ${landed}`);
      await a.context.close();
      await b.context.close();
    }

    // ── A12-B2: the duplicate-submit guard is per tab ───────────────────────
    {
      const passport = `A12B${Date.now().toString(36).toUpperCase()}`;
      const t1 = await signIn(browser, 'operatorAdminA', 'b2-tab1');
      const t2 = await signIn(browser, 'operatorAdminA', 'b2-tab2');
      const body = JSON.stringify({ firstName: 'Browser', lastName: 'Double', passportNumber: passport });
      const [r1, r2] = await Promise.all([
        viaPage(t1, '/proxy-api/pilgrims', { method: 'POST', body }),
        viaPage(t2, '/proxy-api/pilgrims', { method: 'POST', body }),
      ]);
      const created = [r1, r2].filter((r) => r.status < 300).length;
      const list = await viaPage(t1, `/proxy-api/pilgrims?search=${passport}&limit=50`);
      const stored = (list.body?.data?.items ?? []).filter((p) => p.passportNumber === passport).length;
      await t1.page.screenshot({ path: join(OUT, 'b2-two-tabs.png') });
      check(
        'A12-B2 two tabs submitting the same new record at once create two records (defect A12-1 through the UI)',
        created === 2,
        `accepted=${created} stored(list view)=${stored}`,
      );
      await t1.context.close();
      await t2.context.close();
    }

    // ── A12-B3: a taken-down listing is invisible in the marketplace ────────
    {
      const admin = await signIn(browser, 'superAdmin', 'b3-admin');
      const owner = await signIn(browser, 'hotelA', 'b3-owner');
      const made = await viaPage(owner, '/proxy-api/marketplace/listings', {
        method: 'POST',
        body: JSON.stringify({ title: `A12 takedown ${Date.now().toString(36)}`, category: 'hotel_room', priceFrom: 199, pricingModel: 'PER_PERSON' }),
      });
      if (made.status >= 300) {
        check('A12-B3 setup: the owner could publish a listing', false, `HTTP ${made.status}`);
      } else {
        const id = made.body.data.id;
        await viaPage(owner, `/proxy-api/marketplace/listings/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'PUBLISHED' }) });
        const visibleBefore = await viaPage(owner, `/proxy-api/marketplace/listings/${id}`);
        check('A12-B3a the published listing is readable before the takedown', visibleBefore.status === 200, `HTTP ${visibleBefore.status}`);

        const down = await viaPage(admin, `/proxy-api/admin/listings/${id}/take-down`, {
          method: 'PUT',
          body: JSON.stringify({ reason: 'A12 acceptance probe' }),
        });
        check('A12-B3b the platform takes it down', down.status < 300, `HTTP ${down.status}`);

        const republish = await viaPage(owner, `/proxy-api/marketplace/listings/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'PUBLISHED' }),
        });
        check('A12-B3c the owner cannot republish it', republish.status >= 400, `HTTP ${republish.status}`);

        await owner.page.goto(`${WEB}/marketplace`, { waitUntil: 'domcontentloaded' });
        await owner.page.waitForTimeout(2500);
        const shown = await owner.page.content();
        await owner.page.screenshot({ path: join(OUT, 'b3-marketplace.png'), fullPage: true });
        check('A12-B3d it is gone from the marketplace page', !shown.includes(id), id.slice(0, 8));
      }
      await admin.context.close();
      await owner.context.close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  writeFileSync(
    join(OUT, 'summary.json'),
    JSON.stringify({ web: WEB, api: API, ranAt: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 1) + '\n',
  );
  console.log(`\n${results.length - failed.length}/${results.length} checks passed — evidence in ${OUT}`);
  // A12-B2 is expected to "pass" by demonstrating the defect; the exit code reflects probe health only.
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
