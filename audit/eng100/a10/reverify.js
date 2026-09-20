/* A10 — re-verification after the fixers merged (candidate rebuilt at 5875835):
 * 1 reports capability, 2 marketplace request/booking authorisation, 3 double-submit guard,
 * 4 no payment status on provider-side bookings, 5 listing takedown, 6 invoice void authorisation. */
'use strict';
const L = require('./lib');
const R = new L.Recorder('reverify');
const WEB = L.WEB;
const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (a) => a.map((n) => `${n.method} ${n.path} ${n.status}`);
const body = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
async function waitReq(id, re, t0, ms = 12000) { const s = Date.now(); while (Date.now() - s < ms) { if (since(id, t0, re).length) return true; await L.sleep(150); } return false; }
const STAMP = `a10rv-${Date.now().toString(36)}`;
const S = {};
async function section(name, fn) {
  const t = Date.now();
  try { await fn(); console.log(`[${name}] ok in ${Math.round((Date.now() - t) / 1000)}s`); }
  catch (e) {
    console.log(`[${name}] EXCEPTION ${e.message.split('\n')[0]}`);
    R.rec({ area: name, route: '-', role: S.cur?.key || '-', action: `${name}: remaining steps`, expected: 'completes', actual: `harness stopped: ${e.message.split('\n')[0].slice(0, 180)}`, result: 'UNTESTED', reason: 'harness exception' });
  }
}
async function signIn(b, key) { if (S[key]) return S[key]; const id = await L.openIdentity(b, key); const lr = await L.login(id); if (lr.outcome !== 'signed-in') throw new Error(`${key} sign-in failed: ${lr.error || lr.outcome}`); S[key] = id; return id; }
async function openDialog(page, name) {
  const dlg = page.getByRole('dialog');
  for (let i = 0; i < 3; i++) { await page.getByRole('button', { name, exact: true }).first().click().catch(() => {}); try { await dlg.waitFor({ timeout: 5000 }); return dlg; } catch { await L.sleep(700); } }
  throw new Error(`dialog "${name}" did not open`);
}

(async () => {
  R.reset();
  const b = await L.launch();

  // 1. Reports now open on reporting:report:read.
  await section('reports-capability', async () => {
    for (const key of ['visaA', 'operatorStaffA']) {
      const id = await signIn(b, key); S.cur = id;
      await id.page.goto(`${WEB}/reports`); await L.settle(id);
      const st = await L.pageState(id.page);
      const nav = (await L.inventory(id.page)).nav;
      const txt = await body(id.page);
      const w = L.windowStats(id);
      const money = /Revenue|Invoiced|Outstanding|Collected|Profit/i.test(txt.replace(/Reports & Analytics/g, ''));
      const perms = id.me.permissions;
      R.check(st.state === 'rendered' && nav.includes('/reports') && !w.failedApi.length, { area: 'access', route: '/reports', role: key, action: 'Reports open for a role holding reporting:report:read (re-verified after the fix)', expected: 'page renders and the menu lists Reports', actual: `state=${st.state} h1=${JSON.stringify(st.h1)} navHasReports=${nav.includes('/reports')} finance:report:read=${perms.includes('finance:report:read')} failed=${JSON.stringify(w.failedApi)}`, requests: w.api.slice(0, 6), screenshot: await L.shot(id.page, `reverify-reports-${key}`) });
      R.check(!money, { area: 'reports', route: '/reports', role: key, kind: 'denied', action: 'money sections are hidden without finance:report:read', expected: 'no revenue/invoiced/outstanding figures', actual: money ? `money wording present: ${(txt.match(/(Revenue|Invoiced|Outstanding|Collected|Profit)[^.]{0,40}/i) || [])[0]}` : 'no money sections', requests: fmt(since(id, Date.now() - 20000, /reports\/finance/)) });
      const fin = await L.apiProbe(id, 'GET', '/reports/finance');
      R.check(fin.status === 403, { area: 'api-refusal', route: '/reports', role: key, kind: 'denied', action: 'API GET /reports/finance without finance:report:read', expected: '403', actual: `${fin.status} ${fin.message || ''}`, requests: [`GET /api/reports/finance ${fin.status}`] });
    }
  });

  // 2. Marketplace request and booking now require marketplace:listing:read; platform accounts refused.
  await section('marketplace-authorisation', async () => {
    const listing = L.firstArray((await L.api(await signIn(b, 'travelerA'), 'GET', '/marketplace/listings?limit=5')).data)[0];
    for (const key of ['financeA', 'superAdmin']) {
      const id = await signIn(b, key); S.cur = id;
      const req = await L.apiProbe(id, 'POST', '/marketplace/requests', { serviceType: 'HOTEL', title: `A10 re-verify probe ${STAMP} by ${key}`, city: 'Makkah', travelers: 2 });
      const mine = req.status < 300 ? L.firstArray((await L.api(id, 'GET', '/marketplace/requests/mine')).data).filter((x) => (x.title || '').includes(STAMP)) : [];
      R.check(req.status === 403 && mine.length === 0, { area: 'api-refusal', route: '/requests', role: key, kind: 'denied', action: 'API POST /marketplace/requests (re-verified after the fix)', expected: '403 and nothing created', actual: `${req.status} ${req.code || ''} ${req.message || ''} created=${mine.length}`, requests: [`POST /api/marketplace/requests ${req.status}`] });
      if (listing) {
        const bk = await L.apiProbe(id, 'POST', `/marketplace/listings/${listing.id}/bookings`, { customerName: `A10 probe ${key}`, startDate: day(120), endDate: day(121), partySize: 1, notes: `A10 re-verify ${STAMP}` });
        R.check(bk.status === 403, { area: 'api-refusal', route: '/marketplace/[id]', role: key, kind: 'denied', action: 'API POST /marketplace/listings/:id/bookings (re-verified)', expected: '403', actual: `${bk.status} ${bk.code || ''} ${bk.message || ''}`, requests: [`POST /api/marketplace/listings/:id/bookings ${bk.status}`] });
      }
    }
    // A traveler must still be able to do both.
    const A = await signIn(b, 'travelerA'); S.cur = A;
    const ok = await L.apiProbe(A, 'POST', '/marketplace/requests', { serviceType: 'HOTEL', title: `A10 traveler still works ${STAMP}`, city: 'Makkah', travelers: 2 });
    if (ok.status < 300 && ok.data?.id) await L.apiProbe(A, 'POST', `/marketplace/requests/${ok.data.id}/close`, {});
    R.check(ok.status < 300, { area: 'requests', route: '/requests', role: 'travelerA', action: 'a traveler can still post a marketplace request after the fix', expected: '2xx', actual: `${ok.status} ${ok.message || ''} (closed again by A10)`, requests: [`POST /api/marketplace/requests ${ok.status}`] });
  });

  // 3. Double-submit guard on the shared API client.
  await section('double-submit', async () => {
    // pilgrim
    const O = await signIn(b, 'operatorAdminA'); S.cur = O;
    await O.page.goto(`${WEB}/pilgrims`); await L.settle(O);
    let dlg = await openDialog(O.page, 'Add Pilgrim');
    await dlg.getByLabel('First Name').fill('A10');
    await dlg.getByLabel('Last Name').fill(`Pilgrim ${STAMP}`);
    let t = Date.now();
    await dlg.getByRole('button', { name: 'Add pilgrim' }).dblclick();
    await waitReq(O, /POST \/api\/pilgrims$/, t); await L.settle(O);
    const pq = since(O, t, /POST \/api\/pilgrims$/);
    const rows = L.firstArray((await L.api(O, 'GET', `/pilgrims?search=${encodeURIComponent(STAMP)}`)).data);
    R.check(pq.length === 1 && rows.length === 1, { area: 'pilgrims', route: '/pilgrims', role: 'operatorAdminA', kind: 'double-submit', action: 'double-click Add pilgrim (re-verified after the single-flight guard)', expected: 'one request, one record', actual: `${fmt(pq).join(', ')} records=${rows.length}`, requests: fmt(pq), readback: 'GET /api/pilgrims?search=<stamp>' });
    // hotel
    const H = await signIn(b, 'hotelA'); S.cur = H;
    await H.page.goto(`${WEB}/hotels`); await L.settle(H);
    dlg = await openDialog(H.page, 'Add hotel');
    await dlg.getByLabel('Hotel name *').fill(`A10 Hotel ${STAMP}`);
    const city = dlg.getByLabel('City *');
    const cityOpts = await city.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    if (cityOpts.length) await city.selectOption(cityOpts[0]);
    t = Date.now();
    await dlg.getByRole('button', { name: 'Add hotel' }).dblclick();
    await waitReq(H, /POST \/api\/hotels$/, t); await L.settle(H);
    const hq = since(H, t, /POST \/api\/hotels$/);
    const hotels = L.firstArray((await L.api(H, 'GET', '/hotels?limit=100')).data).filter((x) => (x.name || '').includes(STAMP));
    R.check(hq.length === 1 && hotels.length === 1, { area: 'hotel', route: '/hotels', role: 'hotelA', kind: 'double-submit', action: 'double-click Add hotel (re-verified)', expected: 'one request, one record', actual: `${fmt(hq).join(', ')} records=${hotels.length}`, requests: fmt(hq), readback: 'GET /api/hotels' });
    // vehicle + route
    const T = await signIn(b, 'transportA'); S.cur = T;
    await T.page.goto(`${WEB}/transport/vehicles`); await L.settle(T);
    dlg = await openDialog(T.page, 'Add vehicle');
    await dlg.getByLabel('Plate number *').fill(`A10-${Date.now().toString().slice(-5)}`);
    await dlg.getByLabel('Seats *').fill('20');
    const vtype = dlg.getByLabel('Type *');
    const vo = await vtype.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    if (vo.length) await vtype.selectOption(vo[0]);
    await dlg.getByLabel('Display name').fill(`A10 Bus ${STAMP}`).catch(() => {});
    t = Date.now();
    await dlg.getByRole('button', { name: 'Add vehicle' }).dblclick();
    await waitReq(T, /POST \/api\/transport\/vehicles$/, t); await L.settle(T);
    const vq = since(T, t, /POST \/api\/transport\/vehicles$/);
    const vehicles = L.firstArray((await L.api(T, 'GET', '/transport/vehicles?limit=100')).data).filter((x) => JSON.stringify(x).includes(STAMP));
    R.check(vq.length === 1 && vehicles.length <= 1, { area: 'transport', route: '/transport/vehicles', role: 'transportA', kind: 'double-submit', action: 'double-click Add vehicle (re-verified)', expected: 'one request, one record', actual: `${fmt(vq).join(', ')} records=${vehicles.length}`, requests: fmt(vq), readback: 'GET /api/transport/vehicles' });
    await T.page.goto(`${WEB}/transport/routes`); await L.settle(T);
    dlg = await openDialog(T.page, 'Add route');
    await dlg.getByLabel('Route name *').fill(`A10 Route ${STAMP}`);
    await dlg.getByLabel('From *').fill('Jeddah');
    await dlg.getByLabel('To *').fill('Makkah');
    t = Date.now();
    await dlg.getByRole('button', { name: 'Add route' }).dblclick();
    await waitReq(T, /POST \/api\/transport\/routes$/, t); await L.settle(T);
    const rq = since(T, t, /POST \/api\/transport\/routes$/);
    const routes = L.firstArray((await L.api(T, 'GET', '/transport/routes?limit=100')).data).filter((x) => (x.name || '').includes(STAMP));
    R.check(rq.length === 1 && routes.length === 1, { area: 'transport', route: '/transport/routes', role: 'transportA', kind: 'double-submit', action: 'double-click Add route (re-verified)', expected: 'one request, one record', actual: `${fmt(rq).join(', ')} records=${routes.length}`, requests: fmt(rq), readback: 'GET /api/transport/routes' });
    // social post + chat message
    const A = await signIn(b, 'travelerA'); S.cur = A;
    await A.page.goto(`${WEB}/social`); await L.settle(A);
    await A.page.getByLabel('Write a post').fill(`A10 re-verify post ${STAMP}`);
    t = Date.now();
    await A.page.getByRole('button', { name: /^Post$/ }).dblclick();
    await waitReq(A, /POST \/api\/social\/posts$/, t); await L.settle(A);
    const sq = since(A, t, /POST \/api\/social\/posts$/);
    const posts = L.firstArray((await L.api(A, 'GET', '/social/feed?limit=30')).data).filter((x) => JSON.stringify(x).includes(STAMP));
    R.check(sq.length === 1 && posts.length === 1, { area: 'social', route: '/social', role: 'travelerA', kind: 'double-submit', action: 'double-click Post (re-verified)', expected: 'one request, one post', actual: `${fmt(sq).join(', ')} posts=${posts.length}`, requests: fmt(sq), readback: 'GET /api/social/feed' });
    for (const p of posts) await L.api(A, 'DELETE', `/social/posts/${p.id}`);
    // chat message
    const convs = L.firstArray((await L.api(A, 'GET', '/social/conversations')).data);
    if (convs[0]) {
      await A.page.goto(`${WEB}/messages`); await L.settle(A);
      const box = A.page.getByLabel('Type a message');
      if (await box.count().catch(() => 0)) {
        await box.fill(`A10 re-verify message ${STAMP}`);
        t = Date.now();
        await A.page.getByRole('button', { name: /Send/ }).last().dblclick();
        await waitReq(A, /POST \/api\/social\/conversations\/.*\/messages/, t); await L.settle(A);
        const mq = since(A, t, /POST \/api\/social\/conversations\/.*\/messages/);
        const msgs = L.firstArray((await L.api(A, 'GET', `/social/conversations/${convs[0].id}/messages`)).data).filter((m) => JSON.stringify(m).includes(STAMP));
        R.check(mq.length === 1 && msgs.length <= 1, { area: 'social', route: '/messages', role: 'travelerA', kind: 'double-submit', action: 'double-click Send message (re-verified)', expected: 'one request, one message', actual: `${fmt(mq).join(', ')} messages=${msgs.length}`, requests: fmt(mq), readback: 'GET /api/social/conversations/:id/messages' });
      }
    }
    // preferences
    const own2 = await L.openIdentity(b, 'own2');
    const lr2 = await L.login(own2);
    if (lr2.outcome === 'signed-in') {
      S.cur = own2;
      await own2.page.goto(`${WEB}/settings`); await L.settle(own2);
      const locale = own2.page.locator('#pref-locale');
      const opts = await locale.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
      const cur = await locale.inputValue();
      await locale.selectOption(opts.find((o) => o !== cur) || cur);
      t = Date.now();
      await own2.page.getByRole('button', { name: 'Save preferences' }).dblclick();
      await waitReq(own2, /PUT \/api\/users\/me\/preferences/, t); await L.settle(own2);
      const uq = since(own2, t, /PUT \/api\/users\/me\/preferences/);
      R.check(uq.length === 1, { area: 'settings', route: '/settings', role: 'own2', kind: 'double-submit', action: 'double-click Save preferences (re-verified)', expected: 'one PUT', actual: fmt(uq).join(', '), requests: fmt(uq) });
      await own2.ctx.close();
    }
  });

  // 4. No payment status on provider-side bookings; dashboards show booked value.
  await section('no-payment-status', async () => {
    for (const [key, routes] of [['hotelA', ['/hotel-bookings', '/hotel-dashboard']], ['transportA', ['/transport/bookings', '/transport-dashboard']], ['visaA', ['/compliance', '/visa-dashboard']]]) {
      const id = await signIn(b, key); S.cur = id;
      for (const route of routes) {
        await id.page.goto(`${WEB}${route}`); await L.settle(id);
        const txt = await body(id.page);
        const badge = /\bUnpaid\b|\bPartially paid\b|\bFully paid\b/i.test(txt);
        const revenue = /\bRevenue\b/i.test(txt);
        const booked = /Booked value|Booked/i.test(txt);
        R.check(!badge, { area: key === 'visaA' ? 'visa' : key === 'hotelA' ? 'hotel' : 'transport', route, role: key, action: 'no payment-status badge on provider-side records (re-verified)', expected: 'no Unpaid/Partially paid/Fully paid wording', actual: badge ? `found: ${(txt.match(/(Unpaid|Partially paid|Fully paid)/i) || [])[0]}` : 'none', screenshot: await L.shot(id.page, `reverify-${key}-${route.replace(/\//g, '_')}`) });
        if (route.includes('dashboard')) R.check(!revenue, { area: key === 'visaA' ? 'visa' : key === 'hotelA' ? 'hotel' : 'transport', route, role: key, action: 'dashboard shows booked value rather than revenue (re-verified)', expected: 'no "Revenue" tile', actual: `revenueWording=${revenue} bookedWording=${booked}` });
      }
    }
  });

  // 5. Listing takedown is a real moderation state.
  await section('listing-takedown', async () => {
    const H = await signIn(b, 'hotelA'); S.cur = H;
    const created = await L.apiProbe(H, 'POST', '/marketplace/listings', { title: `A10 takedown listing ${STAMP}`, category: 'hotel_room', description: 'A10 QA moderation check', priceCents: 40000, currency: 'SAR', city: 'Makkah', pricingModel: 'PER_NIGHT' });
    if (created.status >= 300) { R.rec({ area: 'admin', route: '/admin-listings', role: 'hotelA', action: 'create a listing for the takedown check', expected: '2xx', actual: `${created.status} ${created.message || ''}`, result: 'FAIL' }); return; }
    const lid = created.data.id;
    const SA = await signIn(b, 'superAdmin'); S.cur = SA;
    const del = await L.apiProbe(SA, 'DELETE', `/admin/listings/${lid}`, {});
    const ownerView = await L.apiProbe(H, 'GET', `/marketplace/listings/mine/${lid}`);
    const republish = await L.apiProbe(H, 'PUT', `/marketplace/listings/${lid}`, { status: 'PUBLISHED' });
    const publicDetail = await L.apiProbe(H, 'GET', `/marketplace/listings/${lid}`);
    const search = L.firstArray((await L.api(H, 'GET', `/marketplace/listings?search=${encodeURIComponent(STAMP)}`)).data);
    R.check(del.status < 300 && republish.status === 403 && !!republish.message && ![200, 201].includes(publicDetail.status) && search.length === 0, { area: 'admin', route: '/admin-listings', role: 'hotelA', kind: 'denied', action: 'a taken-down listing cannot be republished by its owner and leaves public search (re-verified)', expected: 'takedown 2xx; owner republish 403 with a reason; not in public search or detail', actual: `takedown=${del.status} ownerView=${ownerView.status} republish=${republish.status} "${republish.message || ''}" publicDetail=${publicDetail.status} inSearch=${search.length}`, requests: [`DELETE /api/admin/listings/:id ${del.status}`, `PUT /api/marketplace/listings/:id ${republish.status}`, `GET /api/marketplace/listings/:id ${publicDetail.status}`] });
  });

  // 6. Voiding an invoice needs the approval capability.
  await section('invoice-void', async () => {
    const O = await signIn(b, 'operatorAdminA'); S.cur = O;
    const inv = L.firstArray((await L.api(O, 'GET', '/finance/invoices?limit=20')).data).find((x) => ['DRAFT', 'ISSUED', 'SENT'].includes(x.status));
    const staff = await signIn(b, 'operatorStaffA');
    if (inv) {
      const byStaff = await L.apiProbe(staff, 'PUT', `/finance/invoices/${inv.id}`, { status: 'VOID' });
      const byStaffStatus = await L.apiProbe(staff, 'PUT', `/finance/invoices/${inv.id}/status`, { status: 'VOID' });
      const after = await L.api(O, 'GET', `/finance/invoices/${inv.id}`);
      R.check([401, 403].includes(byStaff.status) && [401, 403].includes(byStaffStatus.status) && after.data?.status === inv.status, { area: 'api-refusal', route: '/finance/invoices/[id]', role: 'operatorStaffA', kind: 'denied', action: 'void an invoice without the approval capability, through the generic update and the status route (re-verified)', expected: '403 on both; the invoice keeps its status', actual: `PUT /finance/invoices/:id ${byStaff.status} ${byStaff.message || ''}; PUT .../status ${byStaffStatus.status} ${byStaffStatus.message || ''}; status ${inv.status} → ${after.data?.status}`, requests: [`PUT /api/finance/invoices/:id ${byStaff.status}`, `PUT /api/finance/invoices/:id/status ${byStaffStatus.status}`], readback: 'GET /api/finance/invoices/:id' });
    } else R.rec({ area: 'api-refusal', route: '/finance/invoices/[id]', role: 'operatorStaffA', action: 'void an invoice without the approval capability', expected: 'an open invoice to probe', actual: 'no DRAFT/ISSUED/SENT invoice available', result: 'UNTESTED', reason: 'no eligible invoice' });
  });

  await b.close();
  console.log(`TOTAL reverify: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
