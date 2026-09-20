/* A10 — follow-up on API calls that answered 200 for a role whose UI route is denied:
 * (1) caller-scoped endpoints must only ever return the caller's own records;
 * (2) write endpoints without a capability check, exercised by roles the UI keeps out of the marketplace;
 * (3) the /reports route rule vs the API's reporting policy. */
'use strict';
const L = require('./lib');
const R = new L.Recorder('refusal-review');
const STAMP = `a10r-${Date.now().toString(36)}`;
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

(async () => {
  R.reset();
  const browser = await L.launch();
  const ids = {};
  for (const k of ['operatorAdminA', 'financeA', 'superAdmin', 'visaA', 'operatorStaffA', 'hotelB']) {
    ids[k] = await L.openIdentity(browser, k);
    const lr = await L.login(ids[k]);
    if (lr.outcome !== 'signed-in') throw new Error(`${k} sign-in failed`);
  }
  // (1) Caller-scoped endpoints return only the caller's own records.
  const owner = (o) => o.customerUserId ?? o.customerId ?? o.userId ?? o.requesterId ?? o.createdById ?? o.travelerUserId ?? o.accountUserId ?? null;
  for (const k of ['operatorAdminA', 'financeA', 'superAdmin', 'hotelB']) {
    const me = ids[k].me.id;
    for (const ep of ['/marketplace/bookings/mine', '/marketplace/requests/mine', '/groups/mine', '/travelers/me/trips', '/travelers/me/links', '/connections', '/social/conversations']) {
      const r = await L.apiProbe(ids[k], 'GET', ep);
      const arr = L.firstArray(r.data);
      const foreign = arr.filter((o) => owner(o) && owner(o) !== me);
      R.check(r.status === 200 ? foreign.length === 0 : [401, 403].includes(r.status), { area: 'api-refusal', route: ep, role: k, kind: 'denied', action: `caller-scoped GET ${ep} for a role whose page is denied`, expected: '200 with only the caller’s own records (or 403)', actual: `${r.status}; items=${arr.length}; items owned by someone else=${foreign.length}`, requests: [`GET /api${ep} ${r.status}`] });
    }
  }
  // (2) Writes without a capability requirement, by roles the UI keeps out of the marketplace / requests.
  const listing = L.firstArray((await L.api(ids.financeA, 'GET', '/marketplace/listings?limit=20&category=HOTEL')).data)[0];
  for (const k of ['financeA', 'superAdmin']) {
    const X = ids[k];
    const req = await L.apiProbe(X, 'POST', '/marketplace/requests', { serviceType: 'HOTEL', title: `A10 policy probe ${STAMP} by ${k}`, city: 'Makkah', travelers: 2 });
    R.check(req.status === 403, { area: 'api-refusal', route: '/requests', role: k, kind: 'denied', action: 'API POST /marketplace/requests (UI denies /requests to this role)', expected: '403 (role has no marketplace capability)', actual: `${req.status} ${req.code || ''} ${req.message || ''}`.trim(), requests: [`POST /api/marketplace/requests ${req.status}`] });
    if (req.status < 300 && req.data?.id) {
      const c = await L.apiProbe(X, 'POST', `/marketplace/requests/${req.data.id}/close`, {});
      R.rec({ area: 'cleanup', route: '/requests', role: k, action: 'close the probe request', expected: '2xx', actual: String(c.status), result: c.status < 300 ? 'PASS' : 'FAIL' });
    }
    if (listing) {
      const bk = await L.apiProbe(X, 'POST', `/marketplace/listings/${listing.id}/bookings`, { customerName: `A10 policy probe ${k}`, startDate: day(90), endDate: day(91), partySize: 1, notes: `A10 policy probe ${STAMP}` });
      R.check(bk.status === 403, { area: 'api-refusal', route: '/marketplace/[id]', role: k, kind: 'denied', action: 'API POST /marketplace/listings/:id/bookings (UI denies /marketplace to this role)', expected: '403', actual: `${bk.status} ${bk.code || ''} ${bk.message || ''}`.trim(), requests: [`POST /api/marketplace/listings/:id/bookings ${bk.status}`] });
      if (bk.status < 300 && bk.data?.id) {
        const c = await L.apiProbe(X, 'POST', `/marketplace/bookings/${bk.data.id}/cancel`, {});
        R.rec({ area: 'cleanup', route: '/marketplace/[id]', role: k, action: 'cancel the probe booking', expected: '2xx', actual: String(c.status), result: c.status < 300 ? 'PASS' : 'FAIL' });
      }
    }
  }
  // (3) Reports: route rule says finance:report:read; what does the API require?
  for (const k of ['visaA', 'operatorStaffA']) {
    const X = ids[k];
    const perms = X.me.permissions;
    const out = [];
    for (const ep of ['/reports/overview', '/reports/pilgrims', '/reports/visa', '/reports/finance']) { const r = await L.apiProbe(X, 'GET', ep); out.push(`${ep} ${r.status}`); }
    await X.page.goto(`${L.WEB}/reports`); await L.settle(X);
    const st = await L.pageState(X.page);
    const inNav = (await L.inventory(X.page)).nav.includes('/reports');
    const consistent = out.every((o) => / 403$/.test(o)) || (st.state !== 'denied');
    R.check(consistent, { area: 'access', route: '/reports', role: k, kind: 'denied', action: 'Reports page rule vs API policy', expected: 'page opens for a role the API serves reports to (or the API refuses them too)', actual: `holds reporting:report:read=${perms.includes('reporting:report:read')} finance:report:read=${perms.includes('finance:report:read')}; UI=${st.state} (${st.deniedTitle || ''}); nav shows Reports=${inNav}; API: ${out.join(', ')}`, requests: out, screenshot: await L.shot(X.page, `reports-denied-${k}`) });
  }
  await browser.close();
  console.log(`TOTAL refusal-review: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
