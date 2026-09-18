/* eslint-disable */
/**
 * A03 browser checks (W09 capability-driven UI, W15 onboarding + KYC, Super Admin surfaces).
 *
 * Drives the installed Google Chrome with playwright-core, one browser context
 * per identity, signing in through the real /login form. Nothing is injected:
 * API probes reuse the session the app itself established in that context.
 *
 *   PLAYWRIGHT_CORE=<path to playwright-core> DEMO_PASSWORD=<documented demo password> \
 *   API_LOG=<file the dev API writes its log to> node browser-check.cjs nav stale relogin onboarding admin
 *
 * Output (sanitized: no passwords, tokens or signed URLs): results-<phase>.json and screens/*.png.
 */
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WEB = process.env.WEB_ORIGIN || 'http://localhost:3403';
const API = process.env.API_ORIGIN || 'http://localhost:4403';
const PASSWORD = process.env.DEMO_PASSWORD;
const API_LOG = process.env.API_LOG;
const OUT = __dirname;
const SHOTS = path.join(OUT, 'screens');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(SHOTS, { recursive: true });

const IDENTITIES = {
  operator: 'admin@alharamain.sa',
  hotel: 'hotel@makkahgrand.dev',
  transport: 'transport@haramaintransport.dev',
  visa: 'visa@fastvisa.dev',
  finance: 'finance@alharamain.sa',
  traveler: 'traveler@umrahconnect.dev',
  superAdmin: 'superadmin@umrahconnect.dev',
};

// What each identity's menu must be: computed by lib/workspace-access.ts from the
// capabilities the API grants (the same lists the unit tests assert).
const EXPECTED_NAV = {
  operator: ['/dashboard', '/pilgrims', '/bookings', '/packages', '/groups', '/hotels', '/transport', '/compliance', '/finance', '/reports', '/marketplace', '/social', '/connections', '/requests'],
  hotel: ['/hotel-dashboard', '/hotels', '/hotel-bookings', '/finance', '/marketplace', '/social', '/connections', '/requests', '/reports'],
  transport: ['/transport-dashboard', '/transport/vehicles', '/transport/drivers', '/transport/routes', '/transport/assignments', '/transport/bookings', '/finance', '/marketplace', '/social', '/connections', '/requests', '/reports'],
  visa: ['/visa-dashboard', '/compliance', '/pilgrims', '/visa-documents', '/visa-requests', '/finance', '/marketplace', '/social', '/connections', '/groups', '/requests'],
  finance: ['/finance-dashboard', '/finance', '/finance-payments', '/bookings', '/budget-plans', '/reports', '/social', '/connections', '/packages'],
  traveler: ['/social', '/discover', '/connections', '/messages', '/travel-plan', '/marketplace', '/requests', '/my-offers', '/my-bookings', '/travel-plan', '/profile', '/onboarding'],
  superAdmin: ['/admin-dashboard', '/admin-tenants', '/admin-users', '/admin-listings', '/admin-kyc', '/admin-inquiries', '/admin-roles', '/admin-logs', '/admin-support', '/admin-settings'],
};

// A route each identity may not open, and the API call behind it (expected 403).
const FORBIDDEN = {
  operator: ['/admin-kyc', '/admin/kyc'],
  hotel: ['/pilgrims', '/pilgrims'],
  transport: ['/hotels', '/hotels'],
  visa: ['/finance-dashboard', '/finance/dashboard-stats'],
  finance: ['/pilgrims', '/pilgrims'],
  traveler: ['/bookings', '/bookings'],
  superAdmin: ['/pilgrims', '/pilgrims'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
const record = (phase, key, value) => ((results[phase] ??= {})[key] = value);
const failures = [];
const check = (phase, label, ok, detail) => {
  (results[phase] ??= {}).checks ??= [];
  results[phase].checks.push({ label, ok: !!ok, ...(detail === undefined ? {} : { detail }) });
  if (!ok) failures.push(`${phase}: ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} [${phase}] ${label}`);
};

/** API paths only; signed-download tokens and ids are not written to evidence. */
const sanitize = (url) =>
  url
    .replace(/^.*\/proxy-api/, '')
    .replace(/\/documents\/signed\/[^/?]+/, '/documents/signed/<token>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\?.*$/, '');

async function identity(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  page.apiLog = [];
  page.on('response', (res) => {
    if (res.url().includes('/proxy-api/')) page.apiLog.push({ at: Date.now(), path: sanitize(res.url()), status: res.status(), method: res.request().method() });
  });
  page.name = name;
  return { context, page };
}

async function login(page, email, password = PASSWORD) {
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  // The button is enabled once the page has hydrated; typing earlier is wiped by hydration.
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 60_000 });
  await page.fill('#signin-email', email);
  await page.fill('#signin-password', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  await page.waitForSelector('nav[aria-label="Workspace"]', { timeout: 60_000 });
  await sleep(500);
}

const navHrefs = (page) =>
  page.$$eval('nav[aria-label="Workspace"] a[data-nav-href]', (links) => links.map((a) => a.getAttribute('data-nav-href')));

/** A request with the app's own session in this context (the access token it stored). */
async function probe(page, method, apiPath, body) {
  return page.evaluate(
    async ({ method, apiPath, body }) => {
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      const res = await fetch(`/proxy-api${apiPath}`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let message;
      try { message = (await res.json())?.error?.message; } catch {}
      return { status: res.status, message };
    },
    { method, apiPath, body },
  );
}

/**
 * The person comes back to the tab. Headless Chrome keeps every tab "visible"
 * and emits no focus or visibilitychange event on a tab switch (checked: none
 * fire, document.visibilityState stays "visible"), so the two events a real
 * return produces are dispatched to the page. The app's own listeners handle them.
 */
async function switchTabs(page) {
  await sleep(2100); // past the app's 2 s refresh throttle
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
}

async function waitFor(fn, timeout = 15_000, step = 300) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last) return last;
    await sleep(step);
  }
  return last;
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const denied = (page) => page.$('[data-access="denied"]').then(Boolean);
const text = (page) => page.evaluate(() => document.querySelector('#workspace-main')?.innerText ?? '');

async function apiLogin(email, password = PASSWORD) {
  const res = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = await res.json();
  if (!res.ok) throw new Error(`API login failed for ${email}: ${res.status}`);
  return body.data.accessToken;
}
async function apiCall(token, method, apiPath, body) {
  const res = await fetch(`${API}/api/v1${apiPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  try { json = await res.json(); } catch {}
  return { status: res.status, data: json?.data, message: json?.error?.message };
}

// ─── Phase: navigation and route access per identity ───────────────────────────
async function phaseNav(browser) {
  for (const [who, email] of Object.entries(IDENTITIES)) {
    const { context, page } = await identity(browser, who);
    try {
      await login(page, email);
      const landing = new URL(page.url()).pathname;
      const hrefs = await navHrefs(page);
      record('nav', who, { landing, nav: hrefs });
      check('nav', `${who}: menu is exactly its capability-permitted set`, JSON.stringify(hrefs) === JSON.stringify(EXPECTED_NAV[who]), { got: hrefs });
      const platformItems = hrefs.filter((h) => h.startsWith('/admin-'));
      check('nav', `${who}: platform chrome only for the platform account`, who === 'superAdmin' ? platformItems.length === hrefs.length : platformItems.length === 0);
      await shot(page, `nav-${who}-landing`);

      // Every menu entry opens, and its page's own API calls are not refused.
      const opened = [];
      for (const href of [...new Set(hrefs)]) {
        const since = Date.now();
        await page.click(`nav[aria-label="Workspace"] a[data-nav-href="${href}"] >> nth=0`);
        await page.waitForURL((u) => u.pathname === href || u.pathname.startsWith(`${href}/`), { timeout: 60_000 });
        await sleep(2500);
        const refused = page.apiLog.filter((r) => r.at >= since && (r.status === 403 || r.status === 401) && !r.path.startsWith('/auth/'));
        opened.push({ href, denied: await denied(page), refused: refused.map((r) => `${r.method} ${r.path} ${r.status}`) });
      }
      record('nav', `${who}-opened`, opened);
      check('nav', `${who}: every menu page opens without a denied state`, opened.every((o) => !o.denied), opened.filter((o) => o.denied));
      check('nav', `${who}: no menu page's API call is refused`, opened.every((o) => o.refused.length === 0), opened.filter((o) => o.refused.length));

      // Direct navigation to a forbidden route: denied state, and the API refuses the data.
      const [route, apiPath] = FORBIDDEN[who];
      await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded' });
      const shown = await waitFor(() => denied(page), 30_000);
      const api = await probe(page, 'GET', apiPath);
      record('nav', `${who}-forbidden`, { route, deniedState: !!shown, api: `${apiPath} → ${api.status}` });
      check('nav', `${who}: direct navigation to ${route} shows the denied state`, shown);
      check('nav', `${who}: API refuses GET ${apiPath} (403)`, api.status === 403, api);
      await shot(page, `nav-${who}-denied`);
    } catch (e) {
      check('nav', `${who}: run`, false, String(e.message || e));
      await shot(page, `nav-${who}-error`).catch(() => {});
    } finally {
      await context.close();
    }
  }
}

// ─── Phase: a grant withdrawn on the server disappears from an open page ──────
async function phaseStale(browser) {
  const adminToken = await apiLogin(IDENTITIES.operator);
  const roles = await apiCall(adminToken, 'GET', '/rbac/roles');
  const staff = roles.data.find((r) => r.name === 'OPERATOR_STAFF');
  const { context, page } = await identity(browser, 'finance');
  let userId;
  try {
    await login(page, IDENTITIES.finance);
    userId = (await page.evaluate(async () => (await (await fetch('/proxy-api/auth/me', { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } })).json()).data.id));
    check('stale', 'finance starts without Pilgrims in the menu', !(await navHrefs(page)).includes('/pilgrims'));

    const grant = await apiCall(adminToken, 'POST', '/rbac/assign', { userId, roleId: staff.id });
    check('stale', 'organization admin grants OPERATOR_STAFF through the API', grant.status === 201, grant.status);
    await switchTabs(page);
    const appeared = await waitFor(async () => (await navHrefs(page)).includes('/pilgrims'));
    check('stale', 'on returning to the tab (focus/visibility) the granted area appears without reload', appeared);
    await shot(page, 'stale-1-granted');
    await page.click('nav[aria-label="Workspace"] a[data-nav-href="/pilgrims"]');
    await page.waitForURL((u) => u.pathname === '/pilgrims');
    await sleep(2000);
    check('stale', 'the granted page opens', !(await denied(page)));

    // Revoked while the page is open; the next API call the page makes gets 403.
    const revoke = await apiCall(adminToken, 'DELETE', `/rbac/assign/${userId}/${staff.id}`);
    check('stale', 'organization admin revokes the role through the API', revoke.status === 200, revoke.status);
    const since = Date.now();
    await page.click('button[aria-label="Refresh information"]');
    const gone = await waitFor(async () => !(await navHrefs(page)).includes('/pilgrims') && (await denied(page)));
    const got403 = page.apiLog.some((r) => r.at >= since && r.path === '/pilgrims' && r.status === 403);
    check('stale', 'a 403 from the API refreshes the profile: menu entry gone, page denied (no reload, no tab switch)', gone && got403, { got403 });
    await shot(page, 'stale-2-revoked-after-403');

    // Same through focus: grant, see it, revoke, switch tabs, gone.
    await apiCall(adminToken, 'POST', '/rbac/assign', { userId, roleId: staff.id });
    await switchTabs(page);
    const back = await waitFor(async () => (await navHrefs(page)).includes('/pilgrims') && !(await denied(page)));
    check('stale', 're-granted: menu entry and page come back on focus', back);
    record('stale', 'focusMechanism', 'focus + visibilitychange dispatched to the page (headless Chrome emits neither on a tab switch)');
    await apiCall(adminToken, 'DELETE', `/rbac/assign/${userId}/${staff.id}`);
    await switchTabs(page);
    const goneAgain = await waitFor(async () => !(await navHrefs(page)).includes('/pilgrims') && (await denied(page)));
    const api = await probe(page, 'GET', '/pilgrims');
    check('stale', 'revoked: on focus the menu entry disappears and the open page shows the denied state', goneAgain);
    check('stale', 'the API independently refuses GET /pilgrims (403)', api.status === 403, api);
    await shot(page, 'stale-3-revoked-after-focus');
  } catch (e) {
    check('stale', 'run', false, String(e.message || e));
    await shot(page, 'stale-error').catch(() => {});
  } finally {
    if (userId) await apiCall(adminToken, 'DELETE', `/rbac/assign/${userId}/${staff.id}`).catch(() => {});
    await context.close();
  }
}

// ─── Phase: signing out and in as someone else keeps the right scope ──────────
async function phaseRelogin(browser) {
  const { context, page } = await identity(browser, 'relogin');
  try {
    await login(page, IDENTITIES.operator);
    const before = await navHrefs(page);
    await page.click('button[aria-label="Sign out"]');
    await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 30_000 });
    await login(page, IDENTITIES.hotel);
    const after = await navHrefs(page);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('currentUser') || '{}').email);
    record('relogin', 'menus', { operator: before, thenHotel: after });
    check('relogin', 'after re-login as another account the menu is that account’s', JSON.stringify(after) === JSON.stringify(EXPECTED_NAV.hotel), after);
    check('relogin', 'the stored profile is the new account', stored === IDENTITIES.hotel);
    await page.goto(`${WEB}/pilgrims`);
    check('relogin', 'the previous account’s pages are refused', await waitFor(() => denied(page), 30_000));
  } catch (e) {
    check('relogin', 'run', false, String(e.message || e));
  } finally {
    await context.close();
  }
}

// ─── Phase: onboarding + KYC with a fresh traveler ────────────────────────────
function verificationToken(email) {
  const log = fs.readFileSync(API_LOG, 'utf8');
  const at = log.lastIndexOf(`to=${email}`);
  if (at < 0) return null;
  const m = /token=([A-Za-z0-9_\-%]+)/.exec(log.slice(at));
  return m ? decodeURIComponent(m[1]) : null;
}

function files() {
  const dir = process.env.WORK_DIR || path.join(require('os').tmpdir(), 'a03-browser-check');
  fs.mkdirSync(dir, { recursive: true });
  const pdf = (n) => Buffer.concat([Buffer.from(`%PDF-1.7\n% Umrah Connect QA document ${n}\n`), Buffer.alloc(2048, 32)]);
  const out = {
    pdf: path.join(dir, 'commercial-registration.pdf'),
    corrected: path.join(dir, 'commercial-registration-clear.pdf'),
    png: path.join(dir, 'licence-photo.png'),
    txt: path.join(dir, 'notes.txt'),
  };
  fs.writeFileSync(out.pdf, pdf(1));
  fs.writeFileSync(out.corrected, pdf(2));
  fs.writeFileSync(out.png, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2048)]));
  fs.writeFileSync(out.txt, 'not a document');
  return { dir, ...out };
}

async function phaseOnboarding(browser) {
  const f = files();
  const suffix = crypto.randomBytes(3).toString('hex');
  const email = `qa.founder.${suffix}@example.com`;
  const password = `Qa-${crypto.randomBytes(9).toString('base64url')}9`;
  const orgName = `QA Zamzam Hotel ${suffix}`;
  record('onboarding', 'founder', { email, organization: orgName });
  const P = await identity(browser, 'provider');
  const S = await identity(browser, 'superAdmin');
  const p = P.page;
  const s = S.page;
  try {
    // Register a traveler through the real signup page.
    await p.goto(`${WEB}/signup`, { waitUntil: 'domcontentloaded' });
    await p.click('text=Hotel / Accommodation');
    await p.fill('input[placeholder="First name"]', 'Qa');
    await p.fill('input[placeholder="Last name"]', 'Founder');
    await p.fill('input[placeholder="Email address"]', email);
    await p.fill('input[placeholder="Password"]', password);
    await Promise.all([p.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 60_000 }), p.click('button:has-text("Create account")')]);
    await login(p, email, password);
    const travelerNav = await navHrefs(p);
    check('onboarding', 'a traveler finds “Register your organization” in the menu', travelerNav.includes('/onboarding'), travelerNav);
    await p.click('nav[aria-label="Workspace"] a[data-nav-href="/onboarding"]');
    await p.waitForURL((u) => u.pathname === '/onboarding');
    const gate = await waitFor(async () => (await text(p)).includes('Confirm your email address first'), 30_000);
    check('onboarding', 'an unverified traveler gets an honest gate with a way to verify', gate);
    await shot(p, 'onb-1-unverified-gate');
    const refused = await probe(p, 'POST', '/onboarding/organization', { type: 'VENDOR_HOTEL', name: orgName, country: 'SA' });
    check('onboarding', 'the API refuses onboarding before verification (403)', refused.status === 403, refused);

    await p.click('button:has-text("Send confirmation email")');
    await waitFor(async () => (await text(p)).includes('confirmation link was sent') || (await text(p)).includes('unavailable'), 15_000);
    await sleep(1000);
    const token = verificationToken(email);
    check('onboarding', 'the development mail transport delivered a confirmation link', !!token);
    const v = await S.context.newPage(); // a separate tab, like opening the email link
    await v.goto(`${WEB}/verify-email?token=${encodeURIComponent(token)}`);
    await v.click('button:has-text("Confirm email")');
    const confirmed = await waitFor(async () => (await v.evaluate(() => document.body.innerText)).includes('Email confirmed'), 15_000);
    check('onboarding', 'the confirmation link verifies the email', confirmed);
    await v.close();
    await p.click('button:has-text("I have confirmed it")');
    const form = await waitFor(async () => !!(await p.$('#org-name')), 15_000);
    check('onboarding', 'after verification the organization form is shown', form);

    // Client validation aligned with the DTO, and the consent guard.
    await p.selectOption('#org-type', 'VENDOR_HOTEL');
    await p.fill('#org-name', orgName);
    await p.fill('#org-phone', '0501234567');
    await p.fill('#org-website', 'zamzam.example');
    await p.click('button:has-text("Create organization")');
    const phoneError = await waitFor(async () => !!(await p.$('#org-phone-error')) && !!(await p.$('#org-website-error')));
    check('onboarding', 'invalid phone and website are explained before anything is sent', phoneError);
    await shot(p, 'onb-2-form-validation');
    await p.fill('#org-phone', '+966501234567');
    await p.fill('#org-website', 'https://zamzam.example');
    await p.fill('#org-licenseNumber', `HTL-${suffix}`);
    await p.click('button:has-text("Create organization")');
    check('onboarding', 'the consent to move the account is required', await waitFor(async () => (await text(p)).includes('Confirm that this account will move')));
    await p.check('input[type="checkbox"]');
    const createdSince = Date.now();
    await p.dblclick('button:has-text("Create organization")'); // a double click must create one organization
    const pending = await waitFor(async () => (await text(p)).includes('Documents needed'), 60_000);
    const creates = p.apiLog.filter((r) => r.at >= createdSince && r.path === '/onboarding/organization' && r.method === 'POST');
    check('onboarding', 'the organization is created once and the page becomes the pending workspace', pending && creates.length === 1, creates.map((c) => c.status));
    const pendingNav = await navHrefs(p);
    check('onboarding', 'a pending organization is offered only verification', JSON.stringify(pendingNav) === JSON.stringify(['/onboarding']), pendingNav);
    await shot(p, 'onb-3-pending-workspace');
    await p.goto(`${WEB}/hotel-dashboard`);
    const redirected = await waitFor(async () => new URL(p.url()).pathname === '/onboarding', 30_000);
    const blocked = await probe(p, 'GET', '/hotels');
    check('onboarding', 'the pending organization does not land on dashboards: /hotel-dashboard → /onboarding', redirected);
    check('onboarding', 'the API refuses operational routes while pending (401, verification not complete)', blocked.status === 401 && /verification is not complete/.test(blocked.message || ''), blocked);

    // Upload: type check, progress to uploaded, remove before submit, submit.
    await waitFor(async () => !!(await p.$('input[type="file"]')), 30_000);
    await p.setInputFiles('input[type="file"]', [f.txt]);
    check('onboarding', 'a file of the wrong type is refused before upload', await waitFor(async () => (await text(p)).includes('Use a PDF, JPEG, PNG, WebP, HEIC or TIFF file.')));
    await p.setInputFiles('input[type="file"]', [f.pdf, f.png]);
    check('onboarding', 'two documents upload with progress to “uploaded”', await waitFor(async () => (await text(p)).includes('2 documents ready'), 30_000));
    await p.click('button[aria-label="Remove licence-photo.png"]');
    check('onboarding', 'a document can be removed before submitting', await waitFor(async () => (await text(p)).includes('1 document ready')));
    await shot(p, 'onb-4-upload-ready');
    await p.click('button:has-text("Submit for review")');
    check('onboarding', 'submission moves the organization to “Awaiting review”', await waitFor(async () => (await text(p)).includes('Awaiting review'), 30_000));
    await shot(p, 'onb-5-awaiting-review');

    // Super Admin rejects with a reason.
    await login(s, IDENTITIES.superAdmin);
    await s.goto(`${WEB}/admin-kyc`);
    const card = `li[data-kyc-id]:has-text("${orgName}")`;
    check('onboarding', 'the submission is in the Super Admin review queue', await waitFor(async () => !!(await s.$(card)), 30_000));
    const docSince = Date.now();
    await s.click(`${card} button[aria-label^="Open commercial-registration.pdf"]`);
    await sleep(2500);
    for (const extra of S.context.pages().filter((x) => x !== s)) await extra.close();
    const signed = s.apiLog.find((r) => r.at >= docSince && /\/documents\/kyc\/:id\/0\/url/.test(r.path));
    check('onboarding', 'the reviewer opens the document through a signed URL (200)', signed?.status === 200, signed);
    await s.click(`${card} button:has-text("Reject")`);
    await s.fill('textarea', 'The commercial registration scan is unreadable. Upload a clearer copy.');
    await s.click('button:has-text("Send back")');
    check('onboarding', 'the rejection is recorded and leaves the pending queue', await waitFor(async () => !(await s.$(card)), 20_000));
    await s.click('button:has-text("Sent back")');
    check('onboarding', 'the rejected submission shows who sent it back and why', await waitFor(async () => {
      const t = await s.evaluate(() => document.body.innerText);
      return t.includes(orgName) && t.includes('Sent back by superadmin@umrahconnect.dev') && t.includes('unreadable');
    }, 20_000));
    await shot(s, 'onb-6-admin-rejected');

    // The provider sees the outcome after focus and resubmits.
    await switchTabs(p);
    check('onboarding', 'the provider sees “Changes required” with the reason after refresh', await waitFor(async () => {
      const t = await text(p);
      return t.includes('Changes required') && t.includes('scan is unreadable');
    }, 40_000));
    await shot(p, 'onb-7-changes-required');
    await p.setInputFiles('input[type="file"]', [f.corrected]);
    await waitFor(async () => (await text(p)).includes('1 document ready'), 30_000);
    await p.click('button:has-text("Submit corrected documents") >> nth=-1');
    check('onboarding', 'the corrected documents are resubmitted', await waitFor(async () => (await text(p)).includes('Awaiting review'), 30_000));

    // Super Admin approves.
    await s.click('button:has-text("Awaiting review")');
    await waitFor(async () => !!(await s.$(card)), 20_000);
    await s.click(`${card} button:has-text("Approve")`);
    await s.click('div[role="dialog"] button:has-text("Approve")');
    check('onboarding', 'the approval is recorded', await waitFor(async () => !(await s.$(card)), 20_000));

    // The provider's workspace opens.
    await switchTabs(p);
    const active = await waitFor(async () => (await navHrefs(p)).includes('/hotel-dashboard'), 40_000);
    check('onboarding', 'after approval the hotel workspace appears without signing in again', active, await navHrefs(p));
    check('onboarding', 'the verification page shows the organization as verified', await waitFor(async () => (await text(p)).includes('is verified'), 20_000));
    await shot(p, 'onb-8-verified');
    await p.click('nav[aria-label="Workspace"] a[data-nav-href="/hotel-dashboard"]');
    await p.waitForURL((u) => u.pathname === '/hotel-dashboard');
    await sleep(2500);
    const hotels = await probe(p, 'GET', '/hotels');
    check('onboarding', 'the dashboard opens and the API now answers (200)', !(await denied(p)) && hotels.status === 200, hotels);
    await shot(p, 'onb-9-hotel-dashboard');

    // The platform audit trail for the organization.
    const tenantId = (await probe(p, 'GET', '/tenants/me')).status === 200 && (await p.evaluate(async () => (await (await fetch('/proxy-api/tenants/me', { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } })).json()).data.id));
    await s.goto(`${WEB}/admin-tenants/${tenantId}`);
    check('onboarding', 'the organization’s detail page shows its KYC and audit trail', await waitFor(async () => {
      const t = await s.evaluate(() => document.body.innerText);
      return t.includes(orgName) && t.includes('Sent back') && t.includes('Approved') && /tenant_kyc/.test(t);
    }, 30_000));
    await shot(s, 'onb-10-admin-tenant-detail');
    record('onboarding', 'tenantId', ':id (not recorded)');
    fs.writeFileSync(path.join(f.dir, 'founder.json'), JSON.stringify({ email, tenantId, orgName }));
  } catch (e) {
    check('onboarding', 'run', false, String(e.message || e));
    await shot(p, 'onb-error-provider').catch(() => {});
    await shot(s, 'onb-error-admin').catch(() => {});
  } finally {
    await P.context.close();
    await S.context.close();
  }
}

// ─── Phase: every Super Admin surface, every control, persisted and read back ─
async function phaseAdmin(browser) {
  const founder = JSON.parse(fs.readFileSync(path.join(files().dir, 'founder.json'), 'utf8'));
  const { context, page } = await identity(browser, 'superAdmin');
  const body = () => page.evaluate(() => document.querySelector('#workspace-main')?.innerText ?? '');
  const visit = async (route) => {
    const since = Date.now();
    await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded' });
    await waitFor(async () => !(await body()).includes('Loading'), 30_000);
    await sleep(1500);
    const failed = page.apiLog.filter((r) => r.at >= since && r.status >= 400);
    return { denied: await denied(page), failed: failed.map((r) => `${r.method} ${r.path} ${r.status}`), unavailable: /Unable to load|Permission required|Information unavailable/.test(await body()) };
  };
  try {
    await login(page, IDENTITIES.superAdmin);
    for (const route of EXPECTED_NAV.superAdmin) {
      const r = await visit(route);
      check('admin', `${route} loads without errors`, !r.denied && !r.failed.length && !r.unavailable, r);
      await shot(page, `admin-${route.slice(1)}`);
    }

    // Users: lock → read back → unlock; force logout; grant and revoke a role.
    await visit('/admin-users');
    await page.fill('input[aria-label="Search"]', founder.email);
    const row = `tr:has-text("${founder.email}")`;
    await waitFor(async () => !!(await page.$(row)), 20_000);
    await page.selectOption(`${row} select[aria-label^="Status for"]`, 'LOCKED');
    await page.click('div[role="dialog"] button:has-text("Change status")');
    await sleep(1500);
    await page.reload();
    await page.fill('input[aria-label="Search"]', founder.email);
    check('admin', 'users: locking persists after reload', await waitFor(async () => (await page.$eval(row, (r) => r.innerText).catch(() => '')).includes('Locked'), 20_000));
    await page.selectOption(`${row} select[aria-label^="Status for"]`, 'ACTIVE');
    await page.click('div[role="dialog"] button:has-text("Change status")');
    await sleep(1500);
    await page.reload();
    await page.fill('input[aria-label="Search"]', founder.email);
    check('admin', 'users: unlocking persists after reload', await waitFor(async () => (await page.$eval(row, (r) => r.innerText).catch(() => '')).includes('Active'), 20_000));
    const grantOptions = await page.$$eval(`${row} select[aria-label^="Grant a role"] option`, (o) => o.map((x) => x.textContent));
    check('admin', 'users: only grantable roles are offered (no SUPER_ADMIN or operator roles for a hotel account)', !grantOptions.includes('SUPER_ADMIN') && !grantOptions.includes('OPERATOR_ADMIN') && grantOptions.includes('FINANCE_MANAGER'), grantOptions);
    await page.selectOption(`${row} select[aria-label^="Grant a role"]`, { label: 'FINANCE_MANAGER' });
    await page.click('div[role="dialog"] button:has-text("Grant role")');
    await sleep(1500);
    await page.reload();
    await page.fill('input[aria-label="Search"]', founder.email);
    check('admin', 'users: a granted role persists', await waitFor(async () => !!(await page.$(`${row} button[aria-label^="Revoke FINANCE_MANAGER"]`)), 20_000));
    await page.click(`${row} button[aria-label^="Revoke FINANCE_MANAGER"]`);
    await page.click('div[role="dialog"] button:has-text("Revoke role")');
    await sleep(1500);
    await page.reload();
    await page.fill('input[aria-label="Search"]', founder.email);
    await waitFor(async () => !!(await page.$(row)), 20_000);
    check('admin', 'users: a revoked role stays revoked', !(await page.$(`${row} button[aria-label^="Revoke FINANCE_MANAGER"]`)));
    await page.click(`${row} button:has-text("Force logout")`);
    await page.click('div[role="dialog"] button:has-text("Revoke sessions")');
    check('admin', 'users: force logout reports the sessions revoked', await waitFor(async () => /session\(s\) revoked/.test(await page.evaluate(() => document.body.innerText)), 15_000));
    await page.fill('input[aria-label="Search"]', 'superadmin@umrahconnect.dev');
    await waitFor(async () => !!(await page.$('tr:has-text("superadmin@umrahconnect.dev")')), 20_000);
    const self = await page.$('tr:has-text("superadmin@umrahconnect.dev") select[aria-label^="Status for"]');
    check('admin', 'users: no control to lock your own account', self ? await self.isDisabled() : true);

    // Organizations: suspend with reason → read back → lift; unverified activation impossible.
    await visit(`/admin-tenants/${founder.tenantId}`);
    await page.click('button[aria-label^="Suspend"]');
    await page.fill('div[role="dialog"] textarea', 'QA suspension check');
    await page.click('div[role="dialog"] button:has-text("Suspend organization")');
    await sleep(1500);
    await page.reload();
    check('admin', 'organizations: suspension persists and is in the audit trail', await waitFor(async () => {
      const t = await body();
      return t.includes('Suspended') && t.includes('QA suspension check');
    }, 20_000));
    await page.click('button[aria-label^="Lift suspension"]');
    await page.click('div[role="dialog"] button:has-text("Lift suspension")');
    await sleep(1500);
    await page.reload();
    check('admin', 'organizations: lifting the suspension returns it to Active', await waitFor(async () => !!(await page.$('button[aria-label^="Suspend"]')) && !(await page.$('button[aria-label^="Lift suspension"]')), 20_000));
    await shot(page, 'admin-tenant-detail-after-suspension');
    const forged = await probe(page, 'PUT', `/admin/tenants/${founder.tenantId}/status`, { status: 'KYC_SUBMITTED' });
    check('admin', 'organizations: the API refuses setting a verification state directly (400)', forged.status === 400, forged);

    // Listings: remove → read back → approve (republish) → read back.
    await visit('/admin-listings');
    // A published listing is archived and then republished, so the data ends as it began.
    const firstListing = await page.$eval('tbody tr:has-text("PUBLISHED")', (r) => r.querySelector('td p')?.textContent).catch(() => null);
    if (firstListing) {
      const lrow = `tbody tr:has-text("${firstListing}")`;
      {
        await page.click(`${lrow} button[aria-label="Remove listing"]`);
        await page.click('div[role="dialog"] button:has-text("Remove listing")');
        await sleep(1500);
        await page.reload();
        check('admin', 'listings: removal persists (ARCHIVED)', await waitFor(async () => (await page.$eval(lrow, (r) => r.innerText).catch(() => '')).includes('ARCHIVED'), 20_000));
      }
      await page.click(`${lrow} button[aria-label^="Approve"]`);
      await page.click('div[role="dialog"] button:has-text("Approve and publish")');
      await sleep(1500);
      await page.reload();
      check('admin', 'listings: approval persists (PUBLISHED)', await waitFor(async () => (await page.$eval(lrow, (r) => r.innerText).catch(() => '')).includes('PUBLISHED'), 20_000));
    } else {
      check('admin', 'listings: there is a listing to moderate', false);
    }

    // Inquiries: change a status → read back → restore.
    await visit('/admin-inquiries');
    const inquiry = await page.$('tbody tr select');
    if (inquiry) {
      const before = await inquiry.inputValue();
      const next = before === 'IN_REVIEW' ? 'RESOLVED' : 'IN_REVIEW';
      await inquiry.selectOption(next);
      await sleep(1500);
      await page.reload();
      await waitFor(async () => !!(await page.$('tbody tr select')), 20_000);
      check('admin', 'inquiries: a status change persists', (await page.$eval('tbody tr select', (s) => s.value)) === next);
      await page.selectOption('tbody tr select >> nth=0', before);
      await sleep(1500);
    } else {
      record('admin', 'inquiries', 'no inquiries in the dev database to act on');
    }

    // Logs: filter by resource and page.
    await visit('/admin-logs');
    await page.fill('input[aria-label="Resource"]', 'tenant_kyc');
    check('admin', 'logs: KYC decisions are in the audit log', await waitFor(async () => (await body()).includes('core:tenant_kyc'), 20_000));

    // Roles: permissions of the Super Admin role.
    await visit('/admin-roles');
    await page.click('button:has-text("SUPER_ADMIN")');
    check('admin', 'roles: the role’s capability matrix is shown', await waitFor(async () => (await body()).includes('SUPER_ADMIN permissions'), 20_000));

    // Platform accounts get no organization pages.
    await page.goto(`${WEB}/social`);
    check('admin', 'the platform account is refused organization pages (denied state)', await waitFor(() => denied(page), 30_000));
  } catch (e) {
    check('admin', 'run', false, String(e.message || e));
    await shot(page, 'admin-error').catch(() => {});
  } finally {
    await context.close();
  }
}

(async () => {
  if (!PASSWORD) throw new Error('Set DEMO_PASSWORD (the documented demo password) in the environment.');
  const phases = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    for (const phase of phases) {
      const run = { nav: phaseNav, stale: phaseStale, relogin: phaseRelogin, onboarding: phaseOnboarding, admin: phaseAdmin }[phase];
      if (!run) throw new Error(`unknown phase ${phase}`);
      const started = new Date().toISOString();
      await run(browser);
      record(phase, 'ranAt', started);
      fs.writeFileSync(path.join(OUT, `results-${phase}.json`), JSON.stringify(results[phase], null, 2));
    }
  } finally {
    await browser.close();
  }
  console.log(failures.length ? `\n${failures.length} FAILED:\n${failures.join('\n')}` : '\nALL CHECKS PASSED');
  process.exit(failures.length ? 1 : 0);
})();
