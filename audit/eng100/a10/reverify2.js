/* A10 — status at 5875835 of the findings the fixers did not list, plus the remaining double-click spots. */
'use strict';
const L = require('./lib');
const R = new L.Recorder('reverify2');
const WEB = L.WEB;
const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (a) => a.map((n) => `${n.method} ${n.path} ${n.status}`);
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
async function waitReq(id, re, t0, ms = 12000) { const s = Date.now(); while (Date.now() - s < ms) { if (since(id, t0, re).length) return true; await L.sleep(150); } return false; }
const STAMP = `a10rv2-${Date.now().toString(36)}`;
(async () => {
  R.reset();
  const b = await L.launch();
  // Listing detail still probes the owner endpoint for non-owners?
  const A = await L.openIdentity(b, 'travelerA');
  if ((await L.login(A)).outcome !== 'signed-in') throw new Error('travelerA sign-in failed');
  const listing = L.firstArray((await L.api(A, 'GET', '/marketplace/listings?limit=5')).data)[0];
  L.markWindow(A);
  await A.page.goto(`${WEB}/marketplace/${listing.id}`); await L.settle(A);
  const w = L.windowStats(A);
  R.check(!w.failedApi.length, { area: 'health', route: '/marketplace/[id]', role: 'travelerA', kind: 'network', action: 'failed API requests when a non-owner opens a listing (re-checked at the new revision)', expected: 'no 4xx request', actual: w.failedApi.join(', ') || 'none', requests: w.api.slice(0, 6), screenshot: await L.shot(A.page, 'reverify2-listing-detail') });
  // Staff still offered an Archive action they cannot use?
  const T = await L.openIdentity(b, 'operatorStaffA');
  if ((await L.login(T)).outcome !== 'signed-in') throw new Error('operatorStaffA sign-in failed');
  await T.page.goto(`${WEB}/pilgrims`); await L.settle(T);
  const archive = await T.page.locator('main table tbody tr').first().locator('button[title="Archive"]').isVisible().catch(() => false);
  const id0 = L.firstArray((await L.api(T, 'GET', '/pilgrims?limit=1')).data)[0];
  const del = id0 ? await L.apiProbe(T, 'DELETE', `/pilgrims/${id0.id}`) : { status: 'n/a' };
  R.check(!archive && del.status === 403, { area: 'pilgrims', route: '/pilgrims', role: 'operatorStaffA', kind: 'denied', action: 'staff are not offered Archive without crm:pilgrim:delete (re-checked at the new revision)', expected: 'no Archive control; API DELETE 403', actual: `archiveVisible=${archive} DELETE=${del.status}`, requests: [`DELETE /api/pilgrims/:id ${del.status}`], screenshot: await L.shot(T.page, 'reverify2-staff-pilgrims') });
  // /reset-password landmark.
  const anon = await L.openIdentity(b, 'anon-rv2');
  await anon.page.goto(`${WEB}/reset-password?token=none`); await L.settle(anon);
  const mains = await anon.page.locator('main').count();
  R.check(mains > 0, { area: 'a11y', route: '/reset-password', role: 'anonymous', action: 'page exposes a <main> landmark (re-checked at the new revision)', expected: 'one <main>', actual: `main landmarks=${mains}` });
  // Hotel allotment double-click (same shared-client guard).
  const H = await L.openIdentity(b, 'hotelA');
  if ((await L.login(H)).outcome !== 'signed-in') throw new Error('hotelA sign-in failed');
  const hotel = L.firstArray((await L.api(H, 'GET', '/hotels?limit=100')).data).find((x) => /A10 Hotel/.test(x.name || ''));
  if (hotel) {
    await H.page.goto(`${WEB}/hotels/${hotel.id}`); await L.settle(H);
    await H.page.getByRole('tab', { name: 'Allotments' }).or(H.page.getByRole('button', { name: 'Allotments', exact: true })).first().click();
    await L.settle(H);
    const open = H.page.getByRole('button', { name: /Contract allotment|Add allotment/ }).first();
    if (await open.isVisible().catch(() => false)) {
      await open.click();
      const dlg = H.page.getByRole('dialog');
      await dlg.waitFor({ timeout: 8000 });
      await dlg.getByLabel('Check-in *').fill(day(60));
      await dlg.getByLabel('Check-out *').fill(day(63));
      for (const n of ['Room type', 'Contract type']) { const s = dlg.getByLabel(n); const o = await s.locator('option').evaluateAll((os) => os.map((x) => x.value).filter(Boolean)); if (o.length) await s.selectOption(o[0]); }
      await dlg.getByLabel('Rooms *').fill('3');
      await dlg.getByLabel('Contract notes').fill(`A10 re-verify allotment ${STAMP}`).catch(() => {});
      const t = Date.now();
      await dlg.getByRole('button', { name: /Contract allotment/ }).last().dblclick();
      await waitReq(H, /allotments/, t); await L.settle(H);
      const q = since(H, t, /allotments/).filter((x) => x.method === 'POST');
      R.check(q.length === 1, { area: 'hotel', route: '/hotels/[id]', role: 'hotelA', kind: 'double-submit', action: 'double-click Contract allotment (re-verified)', expected: 'one request', actual: fmt(q).join(', ') || 'no request', requests: fmt(q) });
    }
  }
  await b.close();
  console.log(`TOTAL reverify2: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
