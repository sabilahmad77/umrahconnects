// Current-state audit (2026-09): load every static web route as three identities
// — anonymous, a real operator account, and a roleless self-signup account — and
// record status, runtime errors, failing API calls, and whether the page fetched
// any live data at all. Output: JSON to argv[2].
const { chromium } = require('playwright-core');
const fs = require('fs');
const BASE = process.env.WEB_URL || 'http://localhost:3000';
const API = process.env.API_URL || 'http://localhost:4100/api/v1';
const routes = fs.readFileSync('/tmp/routes.txt', 'utf8').split('\n').filter((r) => r && !r.includes('['));

async function tokenFor(email, password) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (await r.json())?.data;
}

(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const reg = await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `sweep.${Date.now()}@example.com`, password: 'Passw0rd!x', firstName: 'Sweep', lastName: 'User' }) }).then((r) => r.json());
  const identities = {
    anonymous: null,
    operator: await tokenFor('admin@alharamain.sa', 'Admin@1234'),
    roleless: reg.data,
  };
  const out = {};
  for (const [who, tok] of Object.entries(identities)) {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    if (tok) {
      const payload = JSON.parse(Buffer.from(tok.accessToken.split('.')[1], 'base64url').toString());
      await p.evaluate(({ tok, payload }) => {
        // Same storage the app's own login writes (lib/auth.ts). A roleless
        // account is mapped to 'operator' by inferDashboardType(), so use that.
        const user = JSON.stringify({ id: payload.sub, email: payload.email, tenantId: payload.tenantId,
          roles: payload.roles, dashboardType: 'operator', displayName: payload.email });
        document.cookie = `accessToken=${encodeURIComponent(tok.accessToken)}; path=/`;
        document.cookie = `currentUser=${encodeURIComponent(user)}; path=/`;
        localStorage.setItem('accessToken', tok.accessToken);
        localStorage.setItem('refreshToken', tok.refreshToken);
        localStorage.setItem('currentUser', user);
      }, { tok, payload });
    }
    out[who] = {};
    for (const route of routes) {
      const rec = { pageErrors: [], consoleErrors: [], apiCalls: 0, apiFail: [] };
      const onErr = (e) => rec.pageErrors.push(String(e.message).slice(0, 160));
      const onCon = (m) => { if (m.type() === 'error') rec.consoleErrors.push(m.text().slice(0, 160)); };
      const onRes = (r) => { const u = r.url(); if (u.includes('/proxy-api/')) { rec.apiCalls++; if (r.status() >= 400) rec.apiFail.push(`${r.status()} ${u.split('/proxy-api')[1].split('?')[0]}`); } };
      p.on('pageerror', onErr); p.on('console', onCon); p.on('response', onRes);
      try {
        const resp = await p.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 });
        await p.waitForTimeout(1200);
        rec.status = resp?.status();
        rec.finalPath = new URL(p.url()).pathname;
        const txt = (await p.textContent('body')) || '';
        rec.textLen = txt.length;
        rec.errorScreen = /Application error|Something went wrong|Unhandled Runtime Error|This page could not be found|404/.test(txt.slice(0, 4000));
      } catch (e) { rec.status = 'TIMEOUT'; }
      p.off('pageerror', onErr); p.off('console', onCon); p.off('response', onRes);
      rec.apiFail = [...new Set(rec.apiFail)];
      rec.consoleErrors = [...new Set(rec.consoleErrors)].slice(0, 4);
      out[who][route] = rec;
    }
    await ctx.close();
    console.log(`done ${who}`);
  }
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  await b.close();
})();
