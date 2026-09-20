/* A10 independent functional browser QA — shared harness.
 *
 * Rules this harness enforces:
 *  - every session is created through the real /login form (no token injection, no storage edits);
 *  - passwords are read from the local QA fixture file and never printed or saved;
 *  - no cookies, tokens or storage state are written anywhere;
 *  - API probes are same-origin fetches made from inside the signed-in page, using that page's
 *    own session exactly as the app's API client does; the token never leaves the page.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('/Users/macbook/Projects/umrah-connects/audit/node_modules/playwright-core');

const ROOT = '/Users/macbook/Projects/umrah-connects-integration';
const WEB = 'http://localhost:3300';
const EVID = path.join(ROOT, 'docs/control-tower/evidence/eng100/a10');
const SHOTS = path.join(EVID, 'screens');
const RUNTIME = path.join(process.env.TMPDIR || '/tmp', 'uc-a10');
const RESULTS = path.join(RUNTIME, 'results');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
for (const d of [SHOTS, RESULTS]) fs.mkdirSync(d, { recursive: true });

let REV = null;
function revision() {
  if (!REV) REV = execSync(`git -C ${ROOT} rev-parse --short HEAD`).toString().trim();
  return REV;
}

// ── Identities ────────────────────────────────────────────────────────────────
const CREDS_FILE = path.join(ROOT, '.project/local/qa-credentials.json');
const CREDS = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
const SECRETS = new Map(); // key -> password (in memory only)
const IDENT = {};
for (const i of CREDS.identities) {
  SECRETS.set(i.key, i.password);
  IDENT[i.key] = { key: i.key, email: i.email, role: i.role, org: i.organization, orgSlug: i.organizationSlug, emailVerified: i.emailVerified };
}
/** Extra accounts this worker creates (register flow). Password kept in RUNTIME only (never evidence). */
const OWN_FILE = path.join(RUNTIME, 'own-accounts.json');
function ownAccounts() { try { return JSON.parse(fs.readFileSync(OWN_FILE, 'utf8')); } catch { return {}; } }
function saveOwnAccount(key, email, password, extra = {}) {
  const all = ownAccounts();
  all[key] = { email, password, ...extra };
  fs.writeFileSync(OWN_FILE, JSON.stringify(all, null, 1), { mode: 0o600 });
  SECRETS.set(key, password);
  IDENT[key] = { key, email, role: extra.role || 'PILGRIM', own: true };
}
for (const [k, v] of Object.entries(ownAccounts())) { SECRETS.set(k, v.password); IDENT[k] = { key: k, email: v.email, role: v.role || 'PILGRIM', own: true }; }
function setOwnPassword(key, password) {
  const all = ownAccounts();
  if (all[key]) { all[key].password = password; fs.writeFileSync(OWN_FILE, JSON.stringify(all, null, 1), { mode: 0o600 }); }
  SECRETS.set(key, password);
}
function secretOf(key) { return SECRETS.get(key); }

// ── Recording ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function now() { return new Date().toISOString(); }

class Recorder {
  constructor(name) {
    this.name = name;
    this.file = path.join(RESULTS, `${name}.jsonl`);
    this.count = { PASS: 0, FAIL: 0, UNTESTED: 0 };
    this.seq = 0;
  }
  reset() { try { fs.unlinkSync(this.file); } catch {} }
  rec(o) {
    const row = {
      id: `${this.name}-${String(++this.seq).padStart(4, '0')}`,
      area: o.area, route: o.route, role: o.role, action: o.action, kind: o.kind || 'positive',
      expected: o.expected, actual: o.actual,
      requests: (o.requests || []).slice(0, 12),
      readback: o.readback ?? null,
      screenshot: o.screenshot ?? null,
      result: o.result, reason: o.reason ?? null,
      revision: revision(), timestamp: now(),
    };
    if (o.extra) row.extra = o.extra;
    this.count[row.result] = (this.count[row.result] || 0) + 1;
    fs.appendFileSync(this.file, JSON.stringify(row) + '\n');
    if (row.result === 'FAIL') console.log(`  FAIL ${row.id} [${row.role}] ${row.route} :: ${row.action} :: ${String(row.actual).slice(0, 160)}`);
    return row;
  }
  check(cond, o) { return this.rec({ ...o, result: cond ? 'PASS' : 'FAIL' }); }
}

// ── Browser / identity ────────────────────────────────────────────────────────
async function launch() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--no-default-browser-check'] });
  return browser;
}

const SENSITIVE_QS = /([?&](?:token|code|state|key|signature|sig|t)=)[^&#]*/gi;
function cleanUrl(u) {
  try {
    const url = new URL(u);
    let p = url.pathname.replace(/^\/proxy-api/, '/api');
    const q = url.search.replace(SENSITIVE_QS, '$1<redacted>');
    return (p + q).slice(0, 200);
  } catch { return String(u).slice(0, 200); }
}
const COMMON_SHELL = /\/api\/(auth\/me|notifications(\?|$)|users\/me\/preferences|auth\/refresh|auth\/google\/status)/;

/** One browser context per identity, with network and console capture. */
async function openIdentity(browser, key, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1366, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Riyadh' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(opts.timeout || 15000);
  const id = { key, ctx, page, net: [], console: [], pageErrors: [], failed: [], me: null, inflight: new Set(), lastNet: Date.now(), mark: 0, loginResp: null };
  const track = (req) => ['fetch', 'xhr', 'document', 'script'].includes(req.resourceType());
  page.on('request', (req) => { if (track(req)) { id.inflight.add(req); id.lastNet = Date.now(); } });
  page.on('requestfinished', (req) => { id.inflight.delete(req); id.lastNet = Date.now(); });
  page.on('requestfailed', (req) => {
    id.inflight.delete(req); id.lastNet = Date.now();
    const u = req.url();
    if (u.startsWith(WEB) || u.includes('localhost')) {
      const f = req.failure()?.errorText || 'failed';
      if (!/ERR_ABORTED/.test(f)) id.failed.push({ t: Date.now(), method: req.method(), path: cleanUrl(u), status: 0, error: f, type: req.resourceType() });
      else id.net.push({ t: Date.now(), method: req.method(), path: cleanUrl(u), status: 'aborted', type: req.resourceType() });
    }
  });
  page.on('response', async (res) => {
    const req = res.request();
    const u = res.url();
    if (!u.startsWith(WEB)) return;
    const type = req.resourceType();
    const entry = { t: Date.now(), method: req.method(), path: cleanUrl(u), status: res.status(), type };
    if (u.includes('/proxy-api/') || type === 'document' || res.status() >= 400) id.net.push(entry);
    if (res.status() >= 400) id.failed.push(entry);
    if (u.includes('/proxy-api/auth/login')) id.loginResp = { status: res.status(), retryAfter: res.headers()['retry-after'] || null, t: Date.now() };
    if (/\/proxy-api\/auth\/me(\?|$)/.test(u) && res.status() === 200) {
      try {
        const j = await res.json();
        const d = j?.data || {};
        id.me = { id: d.id, email: d.email, roles: d.roles, permissions: d.permissions, emailVerified: d.emailVerified, hasPassword: d.hasPassword,
          tenant: d.tenant ? { id: d.tenant.id, name: d.tenant.name, slug: d.tenant.slug, type: d.tenant.type, status: d.tenant.status } : null };
      } catch {}
    }
  });
  page.on('console', (m) => { if (m.type() === 'error') id.console.push({ t: Date.now(), text: m.text().replace(/Bearer\s+[\w.-]+/g, 'Bearer <redacted>').slice(0, 240), url: cleanUrl(page.url()) }); });
  page.on('pageerror', (e) => id.pageErrors.push({ t: Date.now(), text: String(e.message || e).slice(0, 240), url: cleanUrl(page.url()) }));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  return id;
}

/** Begin a measurement window (network/console since mark). */
function markWindow(id) { id.mark = Date.now(); }
function windowStats(id) {
  const since = id.mark;
  const net = id.net.filter((n) => n.t >= since);
  const api = net.filter((n) => n.path.startsWith('/api/'));
  const failed = id.failed.filter((n) => n.t >= since);
  const cons = id.console.filter((c) => c.t >= since);
  const perr = id.pageErrors.filter((c) => c.t >= since);
  const counts = {};
  for (const n of api) { const k = `${n.method} ${n.path.split('?')[0]}`; counts[k] = (counts[k] || 0) + 1; }
  const loops = Object.entries(counts).filter(([, c]) => c >= 6).map(([k, c]) => `${k} x${c}`);
  return {
    api: api.map((n) => `${n.method} ${n.path} ${n.status}`),
    failedApi: failed.filter((n) => n.path.startsWith('/api/')).map((n) => `${n.method} ${n.path} ${n.status}${n.error ? ' ' + n.error : ''}`),
    failedOther: failed.filter((n) => !n.path.startsWith('/api/')).map((n) => `${n.method} ${n.path} ${n.status}${n.error ? ' ' + n.error : ''}`),
    consoleJs: cons.filter((c) => !/Failed to load resource/.test(c.text)).map((c) => c.text),
    consoleResource: cons.filter((c) => /Failed to load resource/.test(c.text)).length,
    pageErrors: perr.map((c) => c.text),
    loops,
  };
}

async function settle(id, { min = 350, quiet = 700, max = 12000 } = {}) {
  const start = Date.now();
  await sleep(min);
  while (Date.now() - start < max) {
    if (id.inflight.size === 0 && Date.now() - id.lastNet > quiet) break;
    await sleep(100);
  }
  try {
    await id.page.waitForFunction(() => ![...document.querySelectorAll('[role=status]')].some((e) => /Checking your session|Opening your workspace|Opening sign in|^\s*Loading/.test(e.textContent || '')), null, { timeout: 8000 });
  } catch {}
  const s2 = Date.now();
  while (Date.now() - s2 < 4000) {
    if (id.inflight.size === 0 && Date.now() - id.lastNet > quiet) break;
    await sleep(100);
  }
}

// ── Login pacing (API: 30 logins / 5 min / IP shared with every local worker; 8 / account) ──
const LEDGER = path.join(RUNTIME, 'logins.jsonl');
function ledger() { try { return fs.readFileSync(LEDGER, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } }
async function paceLogin(key, budget = 18, perAccount = 5) {
  for (;;) {
    const cutoff = Date.now() - 300_000;
    const recent = ledger().filter((e) => e.t > cutoff);
    const mine = recent.filter((e) => e.key === key);
    if (recent.length < budget && mine.length < perAccount) break;
    const oldest = (mine.length >= perAccount ? mine : recent)[0].t;
    const wait = Math.max(1000, oldest + 300_000 - Date.now() + 500);
    console.log(`  [pace] login budget reached (${recent.length} recent, ${mine.length} for ${key}); waiting ${Math.round(wait / 1000)}s`);
    await sleep(Math.min(wait, 60_000));
  }
  fs.appendFileSync(LEDGER, JSON.stringify({ t: Date.now(), key }) + '\n');
}

/**
 * Sign in through the real /login form.
 * Returns { outcome: 'signed-in'|'workspace-picker'|'error', path, error, workspaces }.
 */
async function login(id, { email, password, tenantLabel, expectError = false, returnTo } = {}) {
  const page = id.page;
  const ident = IDENT[id.key] || {};
  const em = email || ident.email;
  const pw = password || secretOf(id.key);
  if (!em || !pw) throw new Error(`no credentials for ${id.key}`);
  for (let attempt = 1; attempt <= 5; attempt++) {
    await paceLogin(id.key);
    await page.goto(`${WEB}/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#signin-email').fill(em);
    await page.locator('#signin-password').fill(pw);
    if (tenantLabel) {
      // picker already requested in a previous call on this page is not kept after reload; handled by caller.
    }
    id.loginResp = null;
    await page.locator('form button[type=submit]').click();
    const outcome = await waitLoginOutcome(page, 25000);
    if (id.loginResp?.status === 429) {
      const ra = Number(id.loginResp.retryAfter || 60);
      console.log(`  [pace] 429 on login for ${id.key}; Retry-After ${ra}s (attempt ${attempt})`);
      await sleep(Math.min(ra, 300) * 1000 + 1000);
      continue;
    }
    if (outcome.outcome === 'signed-in') await settle(id);
    return { ...outcome, loginStatus: id.loginResp?.status ?? null };
  }
  return { outcome: 'error', error: 'rate-limited after retries', loginStatus: 429 };
}

async function waitLoginOutcome(page, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const p = new URL(page.url()).pathname;
    if (p !== '/login') return { outcome: 'signed-in', path: p };
    if (await page.locator('#signin-workspace').isVisible().catch(() => false)) {
      const workspaces = await page.locator('#signin-workspace option').allTextContents();
      return { outcome: 'workspace-picker', workspaces: workspaces.filter((w) => w && w !== 'Choose workspace') };
    }
    const alert = page.locator('main [role=alert]');
    if (await alert.first().isVisible().catch(() => false)) {
      const txt = (await alert.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      if (txt) {
        // A busy button means the request is still in flight; an alert while idle is the outcome.
        await sleep(300);
        if (new URL(page.url()).pathname !== '/login') continue;
        return { outcome: 'error', error: txt.slice(0, 200) };
      }
    }
    await sleep(150);
  }
  return { outcome: 'timeout', path: new URL(page.url()).pathname };
}

/** Same-origin API call from inside the signed-in page (token stays in the page). */
async function api(id, method, apiPath, body, { raw = false } = {}) {
  const r = await id.page.evaluate(async ({ method, apiPath, body }) => {
    const m = document.cookie.match(/(?:^|; )accessToken=([^;]*)/);
    let t = m ? decodeURIComponent(m[1]) : null;
    try { t = t || localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken'); } catch {}
    const headers = { Accept: 'application/json' };
    if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
    if (t) headers.Authorization = 'Bearer ' + t;
    const res = await fetch('/proxy-api' + apiPath, { method, headers, body: body == null ? undefined : JSON.stringify(body), credentials: 'include' });
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, code: json?.error?.code ?? null, message: typeof json?.error?.message === 'string' ? json.error.message.slice(0, 200) : (Array.isArray(json?.error?.message) ? json.error.message.join('; ').slice(0, 200) : null), data: json?.data ?? null, meta: json?.meta ?? json?.pagination ?? null, hadToken: !!t };
  }, { method, apiPath, body: body ?? null });
  return r;
}
/** Probe with one silent refresh-by-navigation when the access token expired. */
async function apiProbe(id, method, apiPath, body) {
  let r = await api(id, method, apiPath, body);
  if (r.status === 401 && r.hadToken) {
    await id.page.goto(`${WEB}/settings`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await settle(id);
    r = await api(id, method, apiPath, body);
  }
  return r;
}
function firstArray(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    for (const k of ['items', 'data', 'rows', 'results', 'list', 'records', 'tenants', 'users', 'listings', 'bookings', 'invoices', 'payments', 'pilgrims', 'groups', 'hotels', 'vehicles', 'drivers', 'routes', 'requests', 'applications', 'visas', 'notifications', 'posts', 'conversations', 'connections', 'trips', 'links']) {
      if (Array.isArray(d[k])) return d[k];
    }
    for (const v of Object.values(d)) if (Array.isArray(v)) return v;
  }
  return [];
}

// ── Page state classification ─────────────────────────────────────────────────
async function pageState(page) {
  return page.evaluate(() => {
    const txt = (el) => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
    const path = location.pathname;
    const denied = document.querySelector('[data-access="denied"]');
    const main = document.querySelector('main') || document.body;
    const h1 = [...document.querySelectorAll('h1')].map(txt).filter(Boolean);
    const alerts = [...document.querySelectorAll('[role=alert]')].map(txt).filter(Boolean).slice(0, 4);
    const statuses = [...document.querySelectorAll('[role=status]')].map(txt).filter(Boolean).slice(0, 4);
    const body = txt(document.body);
    const nextErr = /Application error: a client-side exception has occurred|Unhandled Runtime Error|Internal Server Error/.test(body);
    const notFound = /This page could not be found|404: This page could not be found|Page not found/i.test(body);
    let state = 'rendered';
    if (denied) state = 'denied';
    else if (nextErr) state = 'crash';
    else if (path === '/login') state = 'login';
    else if (notFound && !h1.length) state = 'not-found';
    else if (statuses.some((s) => /Checking your session|Opening your workspace|^Loading/.test(s)) && !h1.length) state = 'loading-stuck';
    const errorAlerts = alerts.filter((a) => /Unable to load|could not|couldn’t|failed|error|went wrong|not found|no longer/i.test(a));
    const unavailable = /Information unavailable|The record or service is unavailable/.test(body);
    if (state === 'rendered' && unavailable && !h1.length) state = 'unavailable';
    return { path, state, unavailable, h1: h1.slice(0, 3), deniedTitle: denied ? txt(denied.querySelector('[role=alert] p, [role=status] p')) : null, alerts, errorAlerts, statuses, mainTextLen: txt(main).length };
  });
}

async function inventory(page) {
  return page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const nm = (el) => (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 50);
    const labelOf = (el) => {
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return l.innerText.replace(/\s+/g, ' ').trim(); }
      const pl = el.closest('label'); if (pl) return pl.innerText.replace(/\s+/g, ' ').trim();
      return el.getAttribute('placeholder') || el.name || el.type;
    };
    const main = document.querySelector('main') || document.body;
    const nav = [...document.querySelectorAll('nav a[href], aside a[href]')].filter(vis).map((a) => a.getAttribute('href'));
    return {
      buttons: [...new Set([...main.querySelectorAll('button,[role=button]')].filter(vis).map(nm).filter(Boolean))].slice(0, 40),
      links: [...new Set([...main.querySelectorAll('a[href]')].filter(vis).map((a) => `${nm(a)} -> ${a.getAttribute('href')}`))].slice(0, 40),
      inputs: [...main.querySelectorAll('input,select,textarea')].filter(vis).map((el) => `${el.tagName.toLowerCase()}:${el.type || ''}:${(labelOf(el) || '').slice(0, 40)}`).slice(0, 40),
      nav: [...new Set(nav)],
    };
  });
}

/** Screenshot for evidence (jpeg, viewport). Masks anything that could show a link token. */
async function shot(page, name, { full = false } = {}) {
  const file = path.join(SHOTS, `${name.replace(/[^a-zA-Z0-9_.-]+/g, '_')}.jpg`);
  try {
    // Never capture a revealed password: re-mask any password field that was toggled visible.
    await page.evaluate(() => { for (const el of document.querySelectorAll('input[autocomplete*="password"], input[name*="assword"]')) el.type = 'password'; }).catch(() => {});
    const mask = [page.locator('input[readonly]'), page.locator('code'), page.locator('pre'), page.locator('[data-secret]')];
    await page.screenshot({ path: file, type: 'jpeg', quality: 55, fullPage: full, mask, maskColor: '#888' });
    return path.relative(ROOT, file);
  } catch (e) { return null; }
}

/** Compact description of the open dialog (or main) for diagnostics: labels, buttons. */
async function describe(page, scope = '[role=dialog]') {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope) || document.querySelector('main') || document.body;
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const lab = (el) => el.getAttribute('aria-label') || (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.closest('label')?.innerText || el.placeholder || el.name || el.type;
    return {
      fields: [...root.querySelectorAll('input,select,textarea')].filter(vis).map((el) => `${el.tagName.toLowerCase()}:${(lab(el) || '').replace(/\s+/g, ' ').slice(0, 40)}`),
      buttons: [...root.querySelectorAll('button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim().slice(0, 40)),
      alerts: [...root.querySelectorAll('[role=alert]')].map((a) => a.innerText.replace(/\s+/g, ' ').slice(0, 120)),
    };
  }, scope).catch(() => null);
}

module.exports = {
  describe,
  ROOT, WEB, EVID, SHOTS, RUNTIME, RESULTS, CHROME, IDENT, CREDS, revision, sleep, now,
  Recorder, launch, openIdentity, login, waitLoginOutcome, api, apiProbe, firstArray, settle, markWindow, windowStats,
  pageState, inventory, shot, cleanUrl, COMMON_SHELL, saveOwnAccount, ownAccounts, setOwnPassword, secretOf, paceLogin,
};
