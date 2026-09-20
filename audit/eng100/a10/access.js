/* A10 — route inventory × role access matrix, cross-cutting page health, API refusal probes.
 * Run: node --experimental-strip-types --no-warnings access.js [identityKey ...]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const ORACLE_DIR = path.join(L.RUNTIME, 'oracle');
const STATE_FILE = path.join(L.RUNTIME, 'access-state.json');

function discoverRoutes() {
  const appDir = path.join(L.ROOT, 'apps/web/app');
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'page.tsx') {
        const rel = path.relative(appDir, path.dirname(p));
        const workspace = rel.startsWith('(dashboard)');
        const route = '/' + rel.split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join('/');
        out.push({ template: route === '/' ? '/' : route.replace(/\/$/, ''), workspace, file: path.relative(L.ROOT, p) });
      }
    }
  };
  walk(appDir);
  return out.sort((a, b) => a.template.localeCompare(b.template));
}

function inferDashboardType(roles) {
  const r = (roles || []).map((s) => s.toUpperCase());
  if (r.some((x) => x.includes('SUPER_ADMIN'))) return 'admin';
  if (r.some((x) => x.includes('HOTEL'))) return 'hotel';
  if (r.some((x) => x.includes('TRANSPORT'))) return 'transport';
  if (r.some((x) => x.includes('COMPLIANCE') || x.includes('VISA'))) return 'compliance';
  if (r.some((x) => x.includes('FINANCE'))) return 'finance';
  if (r.some((x) => x.includes('PILGRIM'))) return 'pilgrim';
  return 'operator';
}
function subjectOf(me) {
  return { permissions: me.permissions, tenantType: me.tenant?.type, tenantSlug: me.tenant?.slug, tenantStatus: me.tenant?.status, dashboardType: inferDashboardType(me.roles) };
}

const DENIED_TITLES = {
  'platform-only': 'Platform administration only',
  'organization-only': 'Organization workspace page',
  audience: 'Traveler page',
  permission: 'Permission required',
  unknown: 'Page unavailable',
};

// Dynamic workspace routes: where an identity finds its own record ids.
const DYN = {
  '/admin-tenants/[id]': ['/admin/tenants?limit=5'],
  '/bookings/[id]': ['/bookings?limit=5'],
  '/compliance/[id]': ['/compliance/visas?limit=5'],
  '/finance/invoices/[id]': ['/finance/invoices?limit=5'],
  '/groups/[id]': ['/groups?limit=5'],
  '/hotels/[id]': ['/hotels?limit=5'],
  '/marketplace/[id]': ['/marketplace/listings?limit=5'],
  '/pilgrims/[id]': ['/pilgrims?limit=5'],
  '/requests/[id]': ['/marketplace/requests/mine', '/marketplace/requests/open'],
  '/social/groups/[id]': ['/groups/mine'],
  '/transport/drivers/[id]': ['/transport/drivers?limit=5'],
  '/transport/routes/[id]': ['/transport/routes?limit=5'],
  '/transport/vehicles/[id]': ['/transport/vehicles?limit=5'],
  '/visa-requests/[id]': ['/visa-requests?limit=5'],
};
// The A-side owner whose record is the canonical id for tenant-isolation probes.
const CANON_OWNER = {
  '/admin-tenants/[id]': 'superAdmin', '/bookings/[id]': 'operatorAdminA', '/compliance/[id]': 'visaA', '/finance/invoices/[id]': 'operatorAdminA',
  '/groups/[id]': 'operatorAdminA', '/hotels/[id]': 'hotelA', '/marketplace/[id]': 'travelerA', '/pilgrims/[id]': 'operatorAdminA',
  '/requests/[id]': 'travelerA', '/social/groups/[id]': 'travelerA', '/transport/drivers/[id]': 'transportA', '/transport/routes/[id]': 'transportA',
  '/transport/vehicles/[id]': 'transportA', '/visa-requests/[id]': 'visaA',
};
function labelOf(o) {
  if (!o || typeof o !== 'object') return null;
  const person = [o.firstName, o.lastName].filter(Boolean).join(' ');
  return o.name || o.title || o.subject || o.bookingNumber || o.invoiceNumber || o.referenceNumber || o.reference || o.applicationNumber || o.plateNumber || o.licensePlate || (person || null) || o.number || null;
}

const SHARED_TEMPLATES = new Set(['/marketplace/[id]', '/requests/[id]', '/social/groups/[id]']);
const ORDER = ['operatorAdminA', 'hotelA', 'transportA', 'visaA', 'travelerA', 'superAdmin', 'financeA', 'operatorStaffA', 'operatorAdminB', 'hotelB', 'transportB', 'visaB', 'travelerB', 'travelerUnverified', 'travelerOnboarding'];

(async () => {
  const W = await import(path.join(ORACLE_DIR, 'workspace-access.ts'));
  const R = new L.Recorder('access');
  const only = process.argv.slice(2);
  if (!only.length) R.reset();
  const routes = discoverRoutes();
  const wsRoutes = routes.filter((r) => r.workspace);
  const pubRoutes = routes.filter((r) => !r.workspace);
  const state = fs.existsSync(STATE_FILE) && only.length ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { routes, identities: {}, canon: {}, routeEndpoints: {}, visits: [] };
  state.routes = routes;
  const browser = await L.launch();
  state.chrome = browser.version();
  const sessions = {};
  const sampled = {};
  const keys = only.length ? only : ORDER;

  async function collectIds(id, subj) {
    const own = {};
    for (const [tpl, eps] of Object.entries(DYN)) {
      const rule = W.ruleFor(tpl.replace('[id]', 'x'));
      if (!W.canOpenRoute(subj, tpl.replace('[id]', 'x'))) continue;
      for (const ep of eps) {
        const r = await L.apiProbe(id, 'GET', ep);
        if (r.status !== 200) continue;
        const arr = L.firstArray(r.data);
        if (arr.length && arr[0].id) { own[tpl] = { id: arr[0].id, label: labelOf(arr[0]), tenantId: arr[0].tenantId ?? null, via: ep }; break; }
      }
      void rule;
    }
    return own;
  }

  async function visit(id, url, ctx) {
    L.markWindow(id);
    let navError = null;
    try { await id.page.goto(L.WEB + url, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) { navError = e.message.slice(0, 120); }
    await L.settle(id);
    const st = await L.pageState(id.page);
    const ws = L.windowStats(id);
    // Loop watch: observe 2 more seconds of traffic after settling.
    const before = id.net.length;
    await L.sleep(2000);
    const extra = id.net.slice(before).filter((n) => n.path.startsWith('/api/') && !L.COMMON_SHELL.test(n.path));
    const bodyHasLabel = ctx?.label && ctx.label.length >= 5 ? await id.page.evaluate((l) => document.body.innerText.includes(l), ctx.label) : null;
    return { url, navError, st, ws, extraRequests: extra.map((n) => `${n.method} ${n.path} ${n.status}`), bodyHasLabel };
  }

  const prepared = {};
  async function prepare(key) {
    const id = await L.openIdentity(browser, key);
    sessions[key] = id;
    const lr = await L.login(id);
    if (lr.outcome !== 'signed-in' || !id.me) {
      R.rec({ area: 'auth', route: '/login', role: key, action: 'sign in through /login form', expected: 'signed in, workspace opens', actual: `${lr.outcome} ${lr.error || ''} (login ${lr.loginStatus})`, result: 'FAIL', screenshot: await L.shot(id.page, `access-login-${key}`) });
      return;
    }
    const subj = subjectOf(id.me);
    const expLanding = W.landingPathFor(subj);
    R.check(lr.path === expLanding, { area: 'auth', route: '/login', role: key, action: 'sign in (fresh) and land on workspace home', expected: `lands on ${expLanding}`, actual: `landed on ${lr.path}`, requests: [`POST /api/auth/login ${lr.loginStatus}`, 'GET /api/auth/me 200'] });
    state.identities[key] = { email: L.IDENT[key].email, fixtureRole: L.IDENT[key].role, roles: id.me.roles, permissions: id.me.permissions, tenant: id.me.tenant, dashboardType: subj.dashboardType, landing: lr.path, expectedLanding: expLanding, emailVerified: id.me.emailVerified };
    // Navigation (sidebar) = navigationFor(subject).
    const inv = await L.inventory(id.page);
    const expNav = W.navigationFor(subj).flatMap((s) => s.items.map((i) => i.href));
    const wsPaths = new Set(wsRoutes.map((r) => r.template));
    const shownNav = inv.nav.filter((h) => wsPaths.has(h.split('#')[0]) || expNav.includes(h));
    const missing = expNav.filter((h) => !inv.nav.includes(h));
    const unexpected = shownNav.filter((h) => !expNav.includes(h) && !['/settings', '/notifications', '/onboarding'].includes(h));
    R.check(!missing.length && !unexpected.length, { area: 'navigation', route: lr.path, role: key, action: 'sidebar shows exactly the routes the account can open', expected: expNav.join(' '), actual: `missing=[${missing.join(' ')}] unexpected=[${unexpected.join(' ')}]` });
    state.identities[key].nav = inv.nav;
    const own = await collectIds(id, subj);
    state.identities[key].own = own;
    for (const [tpl, owner] of Object.entries(CANON_OWNER)) {
      if (owner !== key || !own[tpl]) continue;
      // The record's own heading is its identifying label (what must not leak to another organization).
      await id.page.goto(L.WEB + tpl.replace('[id]', own[tpl].id), { waitUntil: 'domcontentloaded' }).catch(() => {});
      await L.settle(id);
      const st = await L.pageState(id.page);
      state.canon[tpl] = { ...own[tpl], label: st.h1[0] || own[tpl].label, owner, ownerTenant: id.me.tenant?.id };
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
    prepared[key] = { id, subj, own };
  }

  async function visitAll(key) {
    if (!prepared[key]) return;
    const { id, subj, own } = prepared[key];

    for (const r of wsRoutes) {
      const targets = [];
      if (!r.template.includes('[')) targets.push({ url: r.template, kind: 'direct' });
      else {
        const mine = own[r.template];
        const canon = state.canon[r.template];
        const shared = SHARED_TEMPLATES.has(r.template);
        const myTenant = id.me.tenant?.id;
        if (mine) targets.push({ url: r.template.replace('[id]', mine.id), kind: 'own-record', label: mine.label });
        if (canon && !shared && canon.ownerTenant !== myTenant) targets.push({ url: r.template.replace('[id]', canon.id), kind: 'other-tenant-record', label: canon.label, canonId: canon.id });
        if (!targets.length) targets.push({ url: r.template.replace('[id]', canon?.id || '00000000-0000-4000-8000-000000000000'), kind: canon ? 'shared-record' : 'unknown-id', label: canon?.label, canonId: canon?.id });
      }
      for (const t of targets) {
        const decision = W.routeDecision(subj, t.url);
        const v = await visit(id, t.url, t);
        const rowBase = { area: 'access', route: r.template, role: key, requests: v.ws.api.slice(0, 10) };
        let exp, ok, actual;
        const sum = `state=${v.st.state} path=${v.st.path} h1=${JSON.stringify(v.st.h1)} denied=${v.st.deniedTitle || '-'} alerts=${JSON.stringify(v.st.errorAlerts).slice(0, 160)}`;
        if (decision.kind === 'deny') {
          const reason = W.deniedReason(subj, t.url);
          exp = `denied state "${DENIED_TITLES[reason]}" at ${t.url}`;
          ok = v.st.state === 'denied' && v.st.path === t.url && (v.st.deniedTitle || '').includes(DENIED_TITLES[reason]);
          actual = sum;
          // The page must not have fetched the route's data while denied.
          const leaked = v.ws.api.filter((a) => !L.COMMON_SHELL.test(a.split(' ')[1]));
          if (leaked.length) actual += ` | data calls while denied: ${leaked.join(', ')}`;
        } else if (decision.kind === 'redirect') {
          exp = `redirect to ${decision.to}`;
          ok = v.st.path === decision.to;
          actual = sum;
        } else if (t.kind === 'other-tenant-record') {
          exp = 'shell opens, record of another organization is not shown (not-found/error state, API 403/404)';
          const recCalls = v.ws.api.filter((a) => a.includes(t.canonId));
          const leakedOk = recCalls.some((a) => / 2\d\d$/.test(a));
          ok = !leakedOk && v.st.state !== 'crash' && v.bodyHasLabel !== true;
          actual = `${sum} | record calls: ${recCalls.join(', ') || 'none'} | labelVisible=${v.bodyHasLabel}`;
          rowBase.kind = 'tenant';
        } else if (t.kind === 'shared-record' || t.kind === 'unknown-id') {
          exp = 'no crash or stuck loader (record shown if the account may see it, otherwise a clean not-found/denied state)';
          ok = !['crash', 'loading-stuck', 'login'].includes(v.st.state) && !v.navError;
          if (t.kind === 'unknown-id') ok = ok && (v.st.state === 'unavailable' || v.st.state === 'denied');
          actual = `${sum} | labelVisible=${v.bodyHasLabel}`;
          rowBase.kind = 'shared';
        } else {
          exp = 'page renders (heading, no crash, no error state, no stuck loader)';
          ok = v.st.state === 'rendered' && v.st.h1.length > 0 && !v.st.errorAlerts.length && !v.navError;
          actual = sum + (v.navError ? ` navError=${v.navError}` : '');
        }
        const sk = `${key}:${decision.kind}:${ok}`;
        sampled[sk] = (sampled[sk] || 0) + 1;
        const screenshot = (!ok || sampled[sk] <= 2) ? await L.shot(id.page, `access-${key}-${t.url.replace(/\//g, '_')}`) : null;
        R.check(ok, { ...rowBase, kind: rowBase.kind || (decision.kind === 'allow' ? 'positive' : 'denied'), action: `direct URL ${t.kind} ${t.url}`, expected: exp, actual, screenshot });
        // Cross-cutting health for pages that render.
        if (decision.kind === 'allow' && (t.kind === 'direct' || t.kind === 'own-record')) {
          const failedUnexpected = v.ws.failedApi;
          R.check(!v.ws.consoleJs.length && !v.ws.pageErrors.length, { area: 'health', route: r.template, role: key, kind: 'console', action: `console errors on ${t.url}`, expected: 'no JS console errors / page errors', actual: JSON.stringify([...v.ws.consoleJs, ...v.ws.pageErrors]).slice(0, 400) || '[]' });
          R.check(!failedUnexpected.length, { area: 'health', route: r.template, role: key, kind: 'network', action: `failed API requests on ${t.url}`, expected: 'no 4xx/5xx or failed /api requests', actual: failedUnexpected.join(', ').slice(0, 400) || 'none', requests: failedUnexpected.slice(0, 8) });
          R.check(!v.ws.loops.length && v.extraRequests.length <= 2, { area: 'health', route: r.template, role: key, kind: 'loop', action: `request loop check on ${t.url}`, expected: 'no endpoint called ≥6 times; no sustained traffic after settle', actual: `loops=${JSON.stringify(v.ws.loops)} afterSettle=${JSON.stringify(v.extraRequests).slice(0, 200)}` });
          // Endpoint map for denied-role probes.
          for (const a of v.ws.api) {
            const [m, p, s] = a.split(' ');
            if (m !== 'GET' || L.COMMON_SHELL.test(p) || !/^2/.test(s)) continue;
            (state.routeEndpoints[r.template] ||= {});
            const norm = p.replace(/^\/api/, '');
            state.routeEndpoints[r.template][norm] = (state.routeEndpoints[r.template][norm] || 0) + 1;
          }
          if (Math.random() < 1) {
            const invp = await L.inventory(id.page);
            (state.controls ||= {})[`${key} ${r.template}`] = { buttons: invp.buttons, inputs: invp.inputs, links: invp.links.length };
          }
        }
        state.visits.push({ key, template: r.template, url: t.url, kind: t.kind, decision: decision.kind, state: v.st.state, finalPath: v.st.path, ok });
      }
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
    console.log(`[${key}] done: ${R.count.PASS} pass / ${R.count.FAIL} fail so far`);
  }

  // Canonical owners first (sequential), then the rest with limited concurrency.
  const first = keys.filter((k) => Object.values(CANON_OWNER).includes(k));
  const rest = keys.filter((k) => !first.includes(k));
  const pool = async (list, n) => { const q = [...list]; await Promise.all(Array.from({ length: n }, async () => { while (q.length) { const k = q.shift(); try { await visitAll(k); } catch (e) { console.log(`[${k}] ERROR ${e.message}`); R.rec({ area: 'harness', route: '-', role: k, action: 'identity run', expected: 'completes', actual: e.message.slice(0, 300), result: 'UNTESTED', reason: 'harness error' }); } } })); };
  for (const k of [...first, ...rest]) {
    try { await prepare(k); } catch (e) { console.log(`[${k}] PREPARE ERROR ${e.message}`); R.rec({ area: 'harness', route: '-', role: k, action: 'sign in + collect ids', expected: 'completes', actual: e.message.slice(0, 300), result: 'UNTESTED', reason: 'harness error' }); }
  }
  await pool([...first, ...rest], 4);

  // Phase 2 — the API refuses the same calls for every denied (role, route) pair.
  for (const key of keys) {
    const id = sessions[key];
    if (!id || !state.identities[key]) continue;
    const subj = subjectOf(state.identities[key]);
    for (const r of wsRoutes) {
      const url = r.template.replace('[id]', state.canon[r.template]?.id || '00000000-0000-4000-8000-000000000000');
      if (W.routeDecision(subj, url).kind !== 'deny') continue;
      const eps = Object.keys(state.routeEndpoints[r.template] || {}).slice(0, 3);
      if (!eps.length) { R.rec({ area: 'api-refusal', route: r.template, role: key, kind: 'denied', action: 'API refuses the route\'s data calls', expected: '403', actual: 'no data endpoint observed for this route (no permitted role loaded data here)', result: 'UNTESTED', reason: 'no observed endpoint' }); continue; }
      for (const ep of eps) {
        const p = await L.apiProbe(id, 'GET', ep);
        const ok = p.status === 403 || (p.status === 404 && /\/[0-9a-f-]{36}/.test(ep));
        R.check(ok, { area: 'api-refusal', route: r.template, role: key, kind: 'denied', action: `API GET ${ep} for a role the UI denies`, expected: '403 (or 404 for another organization\'s record)', actual: `${p.status} ${p.code || ''} ${p.message || ''}`.trim(), requests: [`GET /api${ep} ${p.status}`] });
      }
    }
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
  await browser.close();
  console.log(`TOTAL access: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
