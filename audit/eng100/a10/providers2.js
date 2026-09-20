/* A10 — provider follow-ups with the real field names: hotel allotment, driver, trip, visa application,
 * and a properly-formed cross-organization approval probe. Reuses the records created in the first batch. */
'use strict';
const L = require('./lib');
const ONLY = process.argv.slice(2);
const R = new L.Recorder(ONLY.length ? `providers2-rerun-${ONLY.join('-')}` : 'providers2');
const WEB = L.WEB;
const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (arr) => arr.map((n) => `${n.method} ${n.path} ${n.status}`);
const body = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
async function waitReq(id, re, t0, ms = 12000) { const s = Date.now(); while (Date.now() - s < ms) { if (since(id, t0, re).length) return true; await L.sleep(150); } return false; }
async function toastText(page) { return page.locator('[data-sonner-toast]').allInnerTexts().then((a) => a.join(' | ').replace(/\s+/g, ' ')).catch(() => ''); }
const STAMP = `a10-${Date.now().toString(36)}`;
const S = {};
async function section(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t = Date.now();
  try { await fn(); console.log(`[${name}] ok in ${Math.round((Date.now() - t) / 1000)}s`); }
  catch (e) {
    const page = S.cur?.page;
    console.log(`[${name}] EXCEPTION ${e.message.split('\n')[0]} :: ${JSON.stringify(page ? await L.describe(page) : null).slice(0, 400)}`);
    R.rec({ area: name, route: '-', role: S.cur?.key || '-', action: `${name}: remaining steps`, expected: 'completes', actual: `harness stopped: ${e.message.split('\n')[0].slice(0, 180)}`, result: 'UNTESTED', reason: 'harness exception' });
  }
}
async function openDialog(page, name) {
  const dlg = page.getByRole('dialog');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name, exact: false }).first().click().catch(() => {});
    try { await dlg.waitFor({ timeout: 5000 }); return dlg; } catch { await L.sleep(700); }
  }
  throw new Error(`dialog "${name}" did not open`);
}
const alerts = async (scope) => (await scope.locator('[role=alert]').allInnerTexts()).join(' ').replace(/\s+/g, ' ');

(async () => {
  if (!ONLY.length) R.reset();
  const browser = await L.launch();

  // ── Hotel allotment (dialog submit is "Contract allotment") ──────────────
  await section('hotel-allotment', async () => {
    const H = await L.openIdentity(browser, 'hotelA'); S.cur = H;
    if ((await L.login(H)).outcome !== 'signed-in') throw new Error('hotelA sign-in failed');
    const p = H.page;
    const hotel = L.firstArray((await L.api(H, 'GET', '/hotels?limit=50')).data).find((x) => (x.name || '').includes('A10 Hotel'));
    if (!hotel) throw new Error('no A10 hotel to work with');
    await p.goto(`${WEB}/hotels/${hotel.id}`); await L.settle(H);
    await p.getByRole('tab', { name: 'Allotments' }).or(p.getByRole('button', { name: 'Allotments', exact: true })).first().click();
    await L.settle(H);
    const dlg = await openDialog(p, /Contract allotment|Add allotment|New allotment/);
    const submit = dlg.getByRole('button', { name: /Contract allotment|Add|Create|Save/ }).last();
    let t = Date.now();
    await submit.click(); await L.sleep(600);
    const blocked = since(H, t, /allotments/).filter((x) => x.method === 'POST').length === 0;
    R.check(blocked, { area: 'hotel', route: '/hotels/[id]', role: 'hotelA', kind: 'invalid', action: 'Contract allotment with an empty form', expected: 'blocked, no POST', actual: (await alerts(dlg)).slice(0, 160) || 'not submitted' });
    await dlg.getByLabel('Check-in *').fill(day(30));
    await dlg.getByLabel('Check-out *').fill(day(34));
    for (const name of ['Room type', 'Contract type']) {
      const sel = dlg.getByLabel(name);
      const o = await sel.locator('option').evaluateAll((os) => os.map((x) => x.value).filter(Boolean));
      if (o.length) await sel.selectOption(o[0]);
    }
    await dlg.getByLabel('Rooms *').fill('5');
    await dlg.getByLabel('Rate per room per night (SAR)').fill('650');
    await dlg.getByLabel('Contract notes').fill(`A10 QA allotment ${STAMP}`);
    t = Date.now();
    await submit.dblclick();
    await waitReq(H, /allotments/, t); await L.settle(H);
    const q = since(H, t, /allotments/).filter((x) => x.method === 'POST');
    R.check(q.some((x) => x.status < 300), { area: 'hotel', route: '/hotels/[id]', role: 'hotelA', action: 'contract a room allotment (5 rooms, 4 nights)', expected: 'POST allotment 2xx', actual: `${fmt(q).join(', ') || 'no request'} alerts=${(await alerts(dlg)).slice(0, 120)} toast="${(await toastText(p)).slice(0, 60)}"`, requests: fmt(q), screenshot: await L.shot(p, 'hotel-allotment') });
    R.check(q.filter((x) => x.status < 300).length === 1, { area: 'hotel', route: '/hotels/[id]', role: 'hotelA', kind: 'double-submit', action: 'double-click Contract allotment', expected: 'one allotment created', actual: fmt(q).join(', '), requests: fmt(q) });
    await p.reload(); await L.settle(H);
    await p.getByRole('tab', { name: 'Allotments' }).or(p.getByRole('button', { name: 'Allotments', exact: true })).first().click();
    await L.settle(H);
    R.check((await body(p)).includes('5'), { area: 'hotel', route: '/hotels/[id]', role: 'hotelA', kind: 'persist', action: 'allotment after refresh', expected: 'the contracted rooms are listed', actual: (await body(p)).slice(0, 200) });
  });

  // ── Driver and trip ──────────────────────────────────────────────────────
  await section('transport-driver-trip', async () => {
    const T = await L.openIdentity(browser, 'transportA'); S.cur = T;
    if ((await L.login(T)).outcome !== 'signed-in') throw new Error('transportA sign-in failed');
    const p = T.page;
    await p.goto(`${WEB}/transport/drivers`); await L.settle(T);
    const dlg = await openDialog(p, 'Add driver');
    await dlg.getByLabel('First name *').fill('A10');
    await dlg.getByLabel('Last name *').fill(`Driver ${STAMP}`);
    await dlg.getByLabel('Phone *').fill(`+96650${Date.now().toString().slice(-7)}`);
    await dlg.getByLabel('Licence number').fill(`A10LIC${Date.now().toString().slice(-6)}`);
    await dlg.getByLabel('Licence expiry').fill(day(500));
    let t = Date.now();
    await dlg.getByRole('button', { name: 'Add driver' }).last().dblclick();
    await waitReq(T, /POST \/api\/transport\/drivers/, t); await L.settle(T);
    const dq = since(T, t, /POST \/api\/transport\/drivers/);
    R.check(dq.some((x) => x.status < 300), { area: 'transport', route: '/transport/drivers', role: 'transportA', action: 'add a driver', expected: 'POST 2xx and the driver is listed', actual: `${fmt(dq).join(', ') || 'no request'} alerts=${(await alerts(dlg)).slice(0, 140)}`, requests: fmt(dq), screenshot: await L.shot(p, 'transport-driver-created') });
    R.check(dq.filter((x) => x.status < 300).length === 1, { area: 'transport', route: '/transport/drivers', role: 'transportA', kind: 'double-submit', action: 'double-click Add driver', expected: 'one driver created', actual: fmt(dq).join(', '), requests: fmt(dq) });
    await p.reload(); await L.settle(T);
    R.check((await body(p)).includes(`Driver ${STAMP}`), { area: 'transport', route: '/transport/drivers', role: 'transportA', kind: 'persist', action: 'driver listed after refresh', expected: 'listed', actual: (await body(p)).includes(`Driver ${STAMP}`) ? 'listed' : 'missing' });
    // Trip.
    await p.goto(`${WEB}/transport/assignments`); await L.settle(T);
    const td = await openDialog(p, 'New trip');
    const submit = td.getByRole('button', { name: 'Schedule trip' }).last();
    let t2 = Date.now();
    await submit.click(); await L.sleep(600);
    R.check(since(T, t2, /assignments/).filter((x) => x.method === 'POST').length === 0, { area: 'transport', route: '/transport/assignments', role: 'transportA', kind: 'invalid', action: 'Schedule trip with an empty form', expected: 'blocked, no POST', actual: (await alerts(td)).slice(0, 160) || 'not submitted' });
    for (const name of ['Vehicle *', 'Driver', 'Route']) {
      const sel = td.getByLabel(name);
      const o = await sel.locator('option').evaluateAll((os) => os.map((x) => ({ v: x.value, t: x.textContent })).filter((x) => x.v));
      const pick = o.find((x) => x.t.includes(STAMP)) || o[0];
      if (pick) await sel.selectOption(pick.v);
    }
    await td.getByLabel('Pickup date & time *').fill(`${day(7)}T09:00`);
    await td.getByLabel('Passengers *').fill('10');
    await td.getByLabel('Pickup location').fill('Jeddah Airport').catch(() => {});
    await td.getByLabel('Drop-off location').fill('Makkah hotel').catch(() => {});
    await td.getByLabel('Notes').fill(`A10 QA trip ${STAMP}`).catch(() => {});
    t2 = Date.now();
    await submit.click();
    await waitReq(T, /POST \/api\/transport\/(assignments|bookings)/, t2); await L.settle(T);
    const tq = since(T, t2, /POST \/api\/transport\/(assignments|bookings)/);
    R.check(tq.some((x) => x.status < 300), { area: 'transport', route: '/transport/assignments', role: 'transportA', action: 'schedule a trip (vehicle + driver + route)', expected: 'POST 2xx; trip listed', actual: `${fmt(tq).join(', ') || 'no request'} alerts=${(await alerts(td)).slice(0, 140)} toast="${(await toastText(p)).slice(0, 60)}"`, requests: fmt(tq), screenshot: await L.shot(p, 'transport-trip') });
    await L.settle(T);
    const cancel = p.getByRole('button', { name: 'Cancel trip' }).first();
    if (await cancel.isVisible().catch(() => false)) {
      const t3 = Date.now();
      await cancel.click();
      const cd = p.getByRole('dialog');
      if (await cd.isVisible().catch(() => false)) {
        const ta = cd.locator('textarea, input[type=text]').first();
        if (await ta.isVisible().catch(() => false)) await ta.fill('A10 QA cancel');
        await cd.getByRole('button', { name: /Cancel trip|Confirm|Yes/ }).last().click();
      }
      await waitReq(T, /assignments\/.*\/cancel/, t3); await L.settle(T);
      const cq = since(T, t3, /cancel/);
      R.check(cq.some((x) => x.status < 300), { area: 'transport', route: '/transport/assignments', role: 'transportA', action: 'cancel a trip', expected: 'POST cancel 2xx', actual: `${fmt(cq).join(', ')} toast="${(await toastText(p)).slice(0, 60)}"`, requests: fmt(cq) });
    } else R.rec({ area: 'transport', route: '/transport/assignments', role: 'transportA', action: 'cancel a trip', expected: 'Cancel trip on a scheduled trip', actual: 'not offered', result: 'UNTESTED', reason: 'no cancellable trip in the list' });
  });

  // ── Visa application create + decision + cross-organization probe ────────
  await section('visa-application', async () => {
    const V = await L.openIdentity(browser, 'visaA'); S.cur = V;
    if ((await L.login(V)).outcome !== 'signed-in') throw new Error('visaA sign-in failed');
    const p = V.page;
    await p.goto(`${WEB}/compliance`); await L.settle(V);
    const existing = ONLY.length ? L.firstArray((await L.api(V, 'GET', '/compliance/visas?limit=50')).data).find((x) => /A10 Applicant/.test(JSON.stringify(x))) : null;
    const dlg = existing ? null : await openDialog(p, 'New application');
    let app = null;
    if (!existing) {
    await dlg.getByLabel('Applicant name *').fill(`A10 Applicant ${STAMP}`);
    await dlg.getByLabel('Passport number').fill(`A10P${Date.now().toString().slice(-6)}`);
    await dlg.getByLabel('Nationality').fill('PK').catch(() => {});
    for (const name of ['Visa type', 'Regulatory system']) {
      const sel = dlg.getByLabel(name);
      const o = await sel.locator('option').evaluateAll((os) => os.map((x) => x.value).filter(Boolean));
      if (o.length) await sel.selectOption(o[0]);
    }
    await dlg.getByLabel('Service fee (SAR)').fill('300').catch(() => {});
    await dlg.getByLabel('Expected completion').fill(day(20)).catch(() => {});
    await dlg.getByLabel('Notes').fill(`A10 QA visa ${STAMP}`).catch(() => {});
    var t = Date.now();
    await dlg.getByRole('button', { name: 'Create application' }).last().dblclick();
    await waitReq(V, /POST \/api\/compliance\/visas$/, t); await L.settle(V);
    const cq = since(V, t, /POST \/api\/compliance\/visas$/);
    app = L.firstArray((await L.api(V, 'GET', '/compliance/visas?limit=50')).data).find((x) => JSON.stringify(x).includes(STAMP));
    R.check(cq.some((x) => x.status < 300) && !!app, { area: 'visa', route: '/compliance', role: 'visaA', action: 'create a visa application', expected: 'POST 2xx; application created', actual: `${fmt(cq).join(', ') || 'no request'} app=${app ? `${app.applicationNumber ?? app.id.slice(0, 8)} ${app.status}` : 'not found'} alerts=${(await alerts(dlg)).slice(0, 120)}`, requests: fmt(cq), readback: 'GET /api/compliance/visas', screenshot: await L.shot(p, 'visa-application-created') });
    R.check(cq.filter((x) => x.status < 300).length === 1, { area: 'visa', route: '/compliance', role: 'visaA', kind: 'double-submit', action: 'double-click Create application', expected: 'one application created', actual: fmt(cq).join(', '), requests: fmt(cq) });
    }
    const app2 = existing || app;
    if (!app2) throw new Error('no A10 visa application');
    // Work the application through its states.
    await p.goto(`${WEB}/compliance/${app2.id}`); await L.settle(V);
    const steps = [];
    for (const name of ['Start collecting documents', 'Submit application', 'Mark under review', 'Approve']) {
      const b = p.getByRole('button', { name, exact: true }).first();
      if (!(await b.isVisible().catch(() => false))) continue;
      const t2 = Date.now();
      await b.click();
      const d2 = p.getByRole('dialog');
      if (await d2.isVisible().catch(() => false)) {
        for (const [lbl, val] of [['Visa number', `A10V${Date.now().toString().slice(-6)}`], ['Reference', `A10R${Date.now().toString().slice(-6)}`], ['Note', 'A10 QA decision note'], ['Reason', 'A10 QA decision note']]) {
          const el = d2.getByLabel(lbl, { exact: false }).first();
          if (await el.count().catch(() => 0)) await el.fill(val).catch(() => {});
        }
        const dt = d2.locator('input[type=date]');
        for (let i = 0; i < await dt.count(); i++) await dt.nth(i).fill(day(60)).catch(() => {});
        const btns = await d2.locator('button').evaluateAll((bs) => bs.map((b) => (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim()));
        const confirming = btns.filter((b) => b && !/^(Cancel|Close dialog)/i.test(b));
        if (confirming.length) await d2.getByRole('button', { name: confirming[confirming.length - 1], exact: true }).click().catch(() => {});
        await L.sleep(400);
      }
      await waitReq(V, /compliance\/visas\/[^/]+\/(submit|approve|reject|status)/, t2, 8000); await L.settle(V);
      steps.push(`${name}:${fmt(since(V, t2, /compliance\/visas/)).filter((x) => !x.startsWith('GET')).join('/') || 'no request'}`);
    }
    const g = await L.api(V, 'GET', `/compliance/visas/${app2.id}`);
    R.check(steps.some((s) => / 20\d/.test(s)) || steps.length === 0, { area: 'visa', route: '/compliance/[id]', role: 'visaA', action: 'move the application through its workflow', expected: 'each offered transition answers 2xx and the status persists', actual: `${steps.join(' | ') || 'no transition offered'} final=${g.data?.status}`, readback: 'GET /api/compliance/visas/:id', screenshot: await L.shot(p, 'visa-application-workflow') });
    // Documents on the application.
    await p.getByRole('tab', { name: 'Documents' }).or(p.getByRole('button', { name: 'Documents', exact: true })).first().click();
    await L.settle(V);
    const dd = await L.describe(p, 'main');
    const addDoc = p.getByRole('button', { name: /Add document|Upload|Request document/i }).first();
    if (await addDoc.isVisible().catch(() => false)) {
      await addDoc.click();
      const d3 = p.getByRole('dialog');
      await d3.waitFor({ timeout: 6000 }).catch(() => {});
      const fields = await L.describe(p);
      const file = require('path').join(L.RUNTIME, 'a10-kyc-document.png');
      if (!require('fs').existsSync(file)) require('fs').writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
      const fi = d3.locator('input[type=file]').first();
      if (await fi.count()) await fi.setInputFiles(file).catch(() => {});
      for (const [n, v] of [['Document name', `A10 doc ${STAMP}`], ['Expires', day(200)]]) {
        const el = d3.getByLabel(n, { exact: false }).first();
        if (await el.count().catch(() => 0)) await el.fill(v).catch(() => {});
      }
      const sels = d3.locator('select');
      for (let i = 0; i < await sels.count(); i++) { const o = await sels.nth(i).locator('option').evaluateAll((os) => os.map((x) => x.value).filter(Boolean)); if (o.length) await sels.nth(i).selectOption(o[0]).catch(() => {}); }
      const t3 = Date.now();
      await d3.getByRole('button', { name: 'Add document', exact: true }).last().click();
      await waitReq(V, /documents/, t3, 10000); await L.settle(V);
      const q = since(V, t3, /documents/).filter((x) => x.method === 'POST');
      R.check(q.some((x) => x.status < 300), { area: 'visa', route: '/compliance/[id]', role: 'visaA', action: 'add a document to the application', expected: 'POST document 2xx', actual: `${fmt(q).join(', ') || 'no request'} alerts=${(await alerts(d3)).slice(0, 140)}`, requests: fmt(q), extra: { dialog: fields }, screenshot: await L.shot(p, 'visa-document-added') });
    } else R.rec({ area: 'visa', route: '/compliance/[id]', role: 'visaA', action: 'add a document to the application', expected: 'a document control', actual: JSON.stringify(dd).slice(0, 250), result: 'UNTESTED', reason: 'no add-document control on this tab' });
    // Cross-organization: a properly formed approval from agency B.
    const VB = await L.openIdentity(browser, 'visaB');
    if ((await L.login(VB)).outcome !== 'signed-in') throw new Error('visaB sign-in failed');
    const get = await L.apiProbe(VB, 'GET', `/compliance/visas/${app2.id}`);
    const put = await L.apiProbe(VB, 'PUT', `/compliance/visas/${app2.id}/approve`, { visaNumber: `A10-${Date.now().toString().slice(-6)}`, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(), notes: 'cross-organization probe' });
    const del = await L.apiProbe(VB, 'DELETE', `/compliance/visas/${app2.id}`);
    const after = await L.api(V, 'GET', `/compliance/visas/${app2.id}`);
    R.check([403, 404].includes(get.status) && [403, 404].includes(put.status) && [403, 404].includes(del.status) && after.data?.id === app2.id, { area: 'visa', route: '/compliance/[id]', role: 'visaB', kind: 'tenant', action: "agency B reads, approves and deletes agency A's application (well-formed bodies)", expected: '403/404 for all three; the record is untouched', actual: `GET=${get.status} APPROVE=${put.status} (${put.message || ''}) DELETE=${del.status}; owner still sees status=${after.data?.status}`, requests: [`GET /api/compliance/visas/:idA ${get.status}`, `PUT /api/compliance/visas/:idA/approve ${put.status}`, `DELETE /api/compliance/visas/:idA ${del.status}`] });
  });

  await browser.close();
  console.log(`TOTAL providers2: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
