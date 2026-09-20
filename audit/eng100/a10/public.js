/* A10 — public (signed-out) routes: render, console, failed requests, and the obvious actions. */
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./lib');
const R = new L.Recorder('public');
const state = JSON.parse(fs.readFileSync(path.join(L.RUNTIME, 'access-state.json'), 'utf8'));
(async () => {
  R.reset();
  const b = await L.launch();
  const anon = await L.openIdentity(b, 'anonymous');
  const listing = state.canon['/marketplace/[id]']?.id;
  const slug = (() => { try { const src = fs.readFileSync(path.join(L.ROOT, 'apps/web/lib/articles.ts'), 'utf8'); const m = src.match(/slug:\s*'([^']+)'/); return m ? m[1] : null; } catch { return null; } })();
  const routes = state.routes.filter((r) => !r.workspace).map((r) => ({ template: r.template, url: r.template.replace('[id]', listing || '00000000-0000-4000-8000-000000000000').replace('[slug]', slug || 'unknown-article') }));
  let sampled = 0;
  for (const { template, url } of routes) {
    L.markWindow(anon);
    let navError = null;
    try { await anon.page.goto(L.WEB + url, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) { navError = e.message.slice(0, 100); }
    await L.settle(anon);
    const st = await L.pageState(anon.page);
    const w = L.windowStats(anon);
    const isAuthPage = ['/login', '/signup', '/verify-email', '/reset-password', '/auth/callback'].includes(url);
    const ok = !navError && !['crash', 'loading-stuck'].includes(st.state) && (st.h1.length > 0 || isAuthPage || st.mainTextLen > 200);
    const shot = (!ok || sampled++ < 3) ? await L.shot(anon.page, `public-${url.replace(/\//g, '_') || 'home'}`) : null;
    R.check(ok, { area: 'public', route: template, role: 'anonymous', action: `open ${url} signed out`, expected: 'renders without a crash or stuck loader', actual: `state=${st.state} h1=${JSON.stringify(st.h1)} textLen=${st.mainTextLen}${navError ? ` navError=${navError}` : ''}`, requests: w.api.slice(0, 5), screenshot: shot });
    R.check(!w.consoleJs.length && !w.pageErrors.length, { area: 'health', route: template, role: 'anonymous', kind: 'console', action: `console errors on ${url}`, expected: 'no JS console errors', actual: JSON.stringify([...w.consoleJs, ...w.pageErrors]).slice(0, 300) });
    R.check(!w.failedApi.length && !w.failedOther.length, { area: 'health', route: template, role: 'anonymous', kind: 'network', action: `failed requests on ${url}`, expected: 'no 4xx/5xx or failed requests', actual: [...w.failedApi, ...w.failedOther].join(', ').slice(0, 300) || 'none' });
  }
  // The public marketplace preview can be browsed and leads to sign-in for booking.
  await anon.page.goto(`${L.WEB}/marketplace-preview`); await L.settle(anon);
  const cards = await anon.page.locator('main a[href*="/marketplace-preview/"]').count();
  R.check(cards > 0, { area: 'public', route: '/marketplace-preview', role: 'anonymous', action: 'public marketplace preview lists offers', expected: 'listings shown to a signed-out visitor', actual: `${cards} cards` });
  // Signed-out callback without parameters must not crash.
  await anon.page.goto(`${L.WEB}/auth/callback`); await L.settle(anon);
  const cb = await anon.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200));
  R.check(!/Application error/.test(cb), { area: 'public', route: '/auth/callback', role: 'anonymous', kind: 'invalid', action: 'open the sign-in callback without parameters', expected: 'a clear state, no crash', actual: cb.slice(0, 160) });
  await b.close();
  console.log(`TOTAL public: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
