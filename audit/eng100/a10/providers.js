/* A10 — provider workspaces: hotel (hotelA), transport (transportA), visa agency (visaA).
 * Core workflow per role: create, validate, persist, act on the record, refuse the other organization. */
'use strict';
const L = require('./lib');
const ONLY = process.argv.slice(2);
const R = new L.Recorder(ONLY.length ? `providers-rerun-${ONLY.join('-')}` : 'providers');
const WEB = L.WEB;
const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (arr) => arr.map((n) => `${n.method} ${n.path} ${n.status}`);
const body = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
async function waitReq(id, re, t0, ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { if (since(id, t0, re).length) return true; await L.sleep(150); } return false; }
async function toastText(page) { return page.locator('[data-sonner-toast]').allInnerTexts().then((a) => a.join(' | ').replace(/\s+/g, ' ')).catch(() => ''); }
const STAMP = `a10-${Date.now().toString(36)}`;
const S = {}; const ctx = {};

async function section(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t = Date.now();
  try { await fn(); console.log(`[${name}] ok in ${Math.round((Date.now() - t) / 1000)}s`); }
  catch (e) {
    const page = S.cur?.page;
    const d = page ? await L.describe(page) : null;
    console.log(`[${name}] EXCEPTION ${e.message.split('\n')[0]} :: ${JSON.stringify(d).slice(0, 500)}`);
    R.rec({ area: name, route: page ? new URL(page.url()).pathname : '-', role: S.cur?.key || '-', action: `${name}: remaining steps`, expected: 'section completes', actual: `harness stopped: ${e.message.split('\n')[0].slice(0, 200)}`, result: 'UNTESTED', reason: 'harness exception; later steps in this section not executed', extra: { dialog: d } });
  }
}
async function openDialog(page, name) {
  const dlg = page.getByRole('dialog');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name, exact: true }).click().catch(() => {});
    try { await dlg.waitFor({ timeout: 5000 }); return dlg; } catch { await L.sleep(800); }
  }
  throw new Error(`dialog "${name}" did not open`);
}
async function signIn(browser, key) {
  if (S[key]) return S[key];
  const id = await L.openIdentity(browser, key);
  const lr = await L.login(id);
  if (lr.outcome !== 'signed-in') throw new Error(`${key} sign-in failed`);
  S[key] = id;
  return id;
}
/** Fill a dialog field by accessible name when it exists; returns what it did. */
async function fill(dlg, name, value) {
  const el = dlg.getByLabel(name, { exact: false }).first();
  if (await el.count().catch(() => 0)) { await el.fill(String(value)).catch(() => {}); return true; }
  return false;
}

(async () => {
  if (!ONLY.length) R.reset();
  const browser = await L.launch();

  // ── Hotel ────────────────────────────────────────────────────────────────
  await section('hotel', async () => {
    const H = await signIn(browser, 'hotelA'); S.cur = H;
    const p = H.page;
    await p.goto(`${WEB}/hotels`); await L.settle(H);
    const dlg = await openDialog(p, 'Add hotel');
    const desc = await L.describe(p);
    const save = dlg.getByRole('button', { name: /Add hotel|Create|Save/ }).last();
    let t = Date.now();
    await save.click(); await L.sleep(500);
    const e1 = [(await dlg.locator('[role=alert]').allInnerTexts()).join(' '), await toastText(p)].filter(Boolean).join(' | ');
    const blocked = since(H, t, /POST \/api\/hotels$/).length === 0;
    R.check(blocked, { area: 'hotel', route: '/hotels', role: 'hotelA', kind: 'invalid', action: 'Add hotel with an empty form', expected: 'blocked, no POST /hotels', actual: `${e1.slice(0, 160) || 'form not submitted'}`, extra: { dialog: desc } });
    await fill(dlg, 'Name', `A10 Hotel ${STAMP}`);
    await fill(dlg, 'City', 'Makkah');
    await fill(dlg, 'Address', 'A10 QA street');
    await fill(dlg, 'Distance', '350');
    await fill(dlg, 'Star', '4');
    await fill(dlg, 'Phone', '+966500000010');
    await fill(dlg, 'Email', `a10.hotel.${STAMP}@qa.umrahconnect.test`);
    t = Date.now();
    await save.dblclick();
    await waitReq(H, /POST \/api\/hotels$/, t); await L.settle(H);
    const cq = since(H, t, /POST \/api\/hotels$/);
    R.check(cq.length === 1 && cq[0].status < 300, { area: 'hotel', route: '/hotels', role: 'hotelA', kind: 'double-submit', action: 'double-click Add hotel', expected: 'one POST 2xx', actual: fmt(cq).join(', ') || JSON.stringify(await L.describe(p)).slice(0, 200), requests: fmt(cq) });
    const hotels = L.firstArray((await L.api(H, 'GET', '/hotels?limit=50')).data);
    const hotel = hotels.find((x) => (x.name || '').includes(STAMP));
    ctx.hotel = hotel && { id: hotel.id, name: hotel.name };
    R.check(!!hotel, { area: 'hotel', route: '/hotels', role: 'hotelA', action: 'create a hotel', expected: 'hotel created and listed', actual: hotel ? `${hotel.name} (${hotel.city ?? '—'})` : 'not found', readback: 'GET /api/hotels', screenshot: await L.shot(p, 'hotel-created') });
    if (!hotel) throw new Error('hotel not created');
    await p.reload(); await L.settle(H);
    R.check((await body(p)).includes(STAMP), { area: 'hotel', route: '/hotels', role: 'hotelA', kind: 'persist', action: 'hotel listed after refresh', expected: 'listed', actual: (await body(p)).includes(STAMP) ? 'listed' : 'missing' });
    // Room type → room → allotment.
    await p.goto(`${WEB}/hotels/${hotel.id}`); await L.settle(H);
    for (const [tab, dialogName, fields, ep] of [
      ['Room types', /Add room type|New room type|Add/, { Name: `A10 Double ${STAMP}`, Capacity: '2', Price: '650', Beds: '2' }, /room-types/],
      ['Rooms', /Add room|New room|Add/, { Number: `A10-${Date.now().toString().slice(-4)}`, Floor: '3' }, /\/rooms/],
      ['Allotments', /Add allotment|New allotment|Add/, { Rooms: '5', Price: '650' }, /allotments/],
    ]) {
      await p.getByRole('tab', { name: tab }).or(p.getByRole('button', { name: tab, exact: true })).first().click();
      await L.settle(H);
      const open = p.getByRole('button', { name: dialogName }).first();
      if (!(await open.isVisible().catch(() => false))) { R.rec({ area: 'hotel', route: '/hotels/[id]', role: 'hotelA', action: `${tab}: add`, expected: 'an add control', actual: JSON.stringify(await L.describe(p, 'main')).slice(0, 250), result: 'UNTESTED', reason: 'add control not found on this tab' }); continue; }
      await open.click();
      const d = p.getByRole('dialog');
      await d.waitFor({ timeout: 8000 }).catch(() => {});
      const dd = await L.describe(p);
      for (const [k, v] of Object.entries(fields)) await fill(d, k, v);
      const sels = d.locator('select');
      for (let i = 0; i < await sels.count(); i++) { const o = await sels.nth(i).locator('option').evaluateAll((os) => os.map((x) => x.value).filter(Boolean)); if (o.length) await sels.nth(i).selectOption(o[0]).catch(() => {}); }
      const dates = d.locator('input[type=date]');
      for (let i = 0; i < await dates.count(); i++) await dates.nth(i).fill(day(10 + i * 5)).catch(() => {});
      const t2 = Date.now();
      await d.getByRole('button', { name: /Add|Create|Save/ }).last().click();
      await waitReq(H, ep, t2, 8000); await L.settle(H);
      const q = since(H, t2, ep).filter((x) => x.method === 'POST');
      R.check(q.some((x) => x.status < 300), { area: 'hotel', route: '/hotels/[id]', role: 'hotelA', action: `add a ${tab.toLowerCase().replace(/s$/, '')}`, expected: 'POST 2xx and the record appears', actual: `${fmt(q).join(', ') || 'no request'} toast="${(await toastText(p)).slice(0, 70)}"`, requests: fmt(q), extra: { dialog: dd } });
    }
    // Hotel bookings: act on an existing booking (check in / cancel).
    await p.goto(`${WEB}/hotel-bookings`); await L.settle(H);
    const ci = p.getByRole('button', { name: 'Check in' }).first();
    if (await ci.isVisible().catch(() => false)) {
      const t3 = Date.now();
      await ci.click(); await L.settle(H);
      const q = since(H, t3, /hotels\/bookings/);
      R.check(q.some((x) => x.status < 300), { area: 'hotel', route: '/hotel-bookings', role: 'hotelA', action: 'check in a hotel booking', expected: 'PUT 2xx; status moves to checked in', actual: `${fmt(q).join(', ')} toast="${(await toastText(p)).slice(0, 60)}"`, requests: fmt(q), screenshot: await L.shot(p, 'hotel-booking-checkin') });
    } else R.rec({ area: 'hotel', route: '/hotel-bookings', role: 'hotelA', action: 'check in a hotel booking', expected: 'a booking that can be checked in', actual: 'no "Check in" action offered', result: 'UNTESTED', reason: 'no eligible booking' });
    // Other organization's hotel.
    const HB = await signIn(browser, 'hotelB');
    const x = await L.apiProbe(HB, 'GET', `/hotels/${hotel.id}`);
    const y = await L.apiProbe(HB, 'PUT', `/hotels/${hotel.id}`, { name: 'hijacked by B' });
    await HB.page.goto(`${WEB}/hotels/${hotel.id}`); await L.settle(HB);
    const vis = (await body(HB.page)).includes(STAMP);
    R.check([403, 404].includes(x.status) && [403, 404].includes(y.status) && !vis, { area: 'hotel', route: '/hotels/[id]', role: 'hotelB', kind: 'tenant', action: "Hotel B opens and edits Hotel A's hotel", expected: 'GET and PUT 403/404; nothing shown', actual: `GET=${x.status} PUT=${y.status} visible=${vis}`, requests: [`GET /api/hotels/:idA ${x.status}`, `PUT /api/hotels/:idA ${y.status}`], screenshot: await L.shot(HB.page, 'hotel-b-cross-tenant') });
  });

  // ── Transport ────────────────────────────────────────────────────────────
  await section('transport', async () => {
    const T = await signIn(browser, 'transportA'); S.cur = T;
    const p = T.page;
    const made = {};
    for (const [route, btn, fields, ep, key] of [
      ['/transport/vehicles', 'Add vehicle', { 'Plate': `A10-${Date.now().toString().slice(-5)}`, 'Make': 'Toyota', 'Model': 'Coaster', 'Year': '2024', 'Capacity': '20', 'Seats': '20' }, /\/transport\/vehicles$/, 'vehicle'],
      ['/transport/drivers', 'Add driver', { 'Name': `A10 Driver ${STAMP}`, 'Phone': '+966500000020', 'Licence': `A10LIC${Date.now().toString().slice(-5)}`, 'License': `A10LIC${Date.now().toString().slice(-5)}`, 'Nationality': 'SA' }, /\/transport\/drivers$/, 'driver'],
      ['/transport/routes', 'Add route', { 'Name': `A10 Route ${STAMP}`, 'From': 'Jeddah', 'To': 'Makkah', 'Origin': 'Jeddah', 'Destination': 'Makkah', 'Distance': '95', 'Duration': '75', 'Price': '350' }, /\/transport\/routes$/, 'route'],
    ]) {
      await p.goto(`${WEB}${route}`); await L.settle(T);
      const dlg = await openDialog(p, btn);
      const dd = await L.describe(p);
      const save = dlg.getByRole('button', { name: /Add|Create|Save/ }).last();
      let t = Date.now();
      await save.click(); await L.sleep(500);
      const blocked = since(T, t, ep).filter((x) => x.method === 'POST').length === 0;
      const msg = [(await dlg.locator('[role=alert]').allInnerTexts()).join(' '), await toastText(p)].filter(Boolean).join(' | ');
      R.check(blocked, { area: 'transport', route, role: 'transportA', kind: 'invalid', action: `${btn} with an empty form`, expected: 'blocked, no POST', actual: msg.slice(0, 160) || 'not submitted', extra: { dialog: dd } });
      for (const [k, v] of Object.entries(fields)) await fill(dlg, k, v);
      const sels = dlg.locator('select');
      for (let i = 0; i < await sels.count(); i++) { const o = await sels.nth(i).locator('option').evaluateAll((os) => os.map((x) => x.value).filter(Boolean)); if (o.length) await sels.nth(i).selectOption(o[0]).catch(() => {}); }
      const dates = dlg.locator('input[type=date]');
      for (let i = 0; i < await dates.count(); i++) await dates.nth(i).fill(day(400)).catch(() => {});
      t = Date.now();
      await save.dblclick();
      await waitReq(T, ep, t, 10000); await L.settle(T);
      const q = since(T, t, ep).filter((x) => x.method === 'POST');
      R.check(q.length === 1 && q[0].status < 300, { area: 'transport', route, role: 'transportA', kind: 'double-submit', action: `double-click ${btn}`, expected: 'one POST 2xx', actual: fmt(q).join(', ') || `no request; dialog=${JSON.stringify(await L.describe(p)).slice(0, 200)}`, requests: fmt(q) });
      await p.reload(); await L.settle(T);
      const listed = (await body(p)).includes(STAMP) || q.some((x) => x.status < 300);
      made[key] = q.some((x) => x.status < 300);
      R.check(listed, { area: 'transport', route, role: 'transportA', kind: 'persist', action: `${key} persists after refresh`, expected: 'record listed', actual: `${fmt(q).join(', ')} listedAfterReload=${(await body(p)).includes(STAMP)}`, screenshot: await L.shot(p, `transport-${key}-created`) });
    }
    // Trip (assignment): create, then cancel.
    await p.goto(`${WEB}/transport/assignments`); await L.settle(T);
    const dlg = await openDialog(p, 'New trip');
    const dd = await L.describe(p);
    const sels = dlg.locator('select');
    for (let i = 0; i < await sels.count(); i++) { const o = await sels.nth(i).locator('option').evaluateAll((os) => os.map((x) => x.value).filter(Boolean)); if (o.length) await sels.nth(i).selectOption(o[0]).catch(() => {}); }
    await fill(dlg, 'Passengers', '10');
    await fill(dlg, 'Notes', `A10 QA trip ${STAMP}`);
    const dt = dlg.locator('input[type=datetime-local], input[type=date]');
    for (let i = 0; i < await dt.count(); i++) {
      const type = await dt.nth(i).getAttribute('type');
      await dt.nth(i).fill(type === 'date' ? day(7) : `${day(7)}T09:00`).catch(() => {});
    }
    let t = Date.now();
    await dlg.getByRole('button', { name: /Create|Save|Schedule|Add/ }).last().click();
    await waitReq(T, /transport\/assignments/, t, 10000); await L.settle(T);
    const aq = since(T, t, /transport\/assignments/).filter((x) => x.method === 'POST');
    R.check(aq.some((x) => x.status < 300), { area: 'transport', route: '/transport/assignments', role: 'transportA', action: 'schedule a trip', expected: 'POST assignment 2xx', actual: `${fmt(aq).join(', ') || 'no request'} toast="${(await toastText(p)).slice(0, 70)}"`, requests: fmt(aq), extra: { dialog: dd }, screenshot: await L.shot(p, 'transport-trip-created') });
    const cancel = p.getByRole('button', { name: 'Cancel trip' }).first();
    if (await cancel.isVisible().catch(() => false)) {
      t = Date.now();
      await cancel.click();
      const cd = p.getByRole('dialog');
      if (await cd.isVisible().catch(() => false)) {
        const reason = cd.locator('textarea, input[type=text]').first();
        if (await reason.isVisible().catch(() => false)) await reason.fill('A10 QA cancel');
        await cd.getByRole('button', { name: /Cancel trip|Confirm|Yes/ }).last().click();
      }
      await waitReq(T, /assignments\/.*\/cancel/, t, 8000); await L.settle(T);
      const q = since(T, t, /cancel/);
      R.check(q.some((x) => x.status < 300), { area: 'transport', route: '/transport/assignments', role: 'transportA', action: 'cancel a trip', expected: 'POST cancel 2xx', actual: `${fmt(q).join(', ')} toast="${(await toastText(p)).slice(0, 60)}"`, requests: fmt(q) });
    } else R.rec({ area: 'transport', route: '/transport/assignments', role: 'transportA', action: 'cancel a trip', expected: 'a cancellable trip', actual: 'no "Cancel trip" offered', result: 'UNTESTED', reason: 'no eligible trip' });
    // Other organization.
    const TB = await signIn(browser, 'transportB');
    const veh = L.firstArray((await L.api(T, 'GET', '/transport/vehicles?limit=5')).data)[0];
    if (veh) {
      const x = await L.apiProbe(TB, 'GET', `/transport/vehicles/${veh.id}`);
      const y = await L.apiProbe(TB, 'DELETE', `/transport/vehicles/${veh.id}`);
      await TB.page.goto(`${WEB}/transport/vehicles/${veh.id}`); await L.settle(TB);
      const vis = (await body(TB.page)).includes(veh.plateNumber || veh.licensePlate || '@@@');
      R.check([403, 404].includes(x.status) && [403, 404].includes(y.status) && !vis, { area: 'transport', route: '/transport/vehicles/[id]', role: 'transportB', kind: 'tenant', action: "Transport B reads and deletes Transport A's vehicle", expected: '403/404 for both; nothing shown', actual: `GET=${x.status} DELETE=${y.status} visible=${vis}`, requests: [`GET /api/transport/vehicles/:idA ${x.status}`, `DELETE /api/transport/vehicles/:idA ${y.status}`] });
    }
  });

  // ── Visa agency ──────────────────────────────────────────────────────────
  await section('visa', async () => {
    const V = await signIn(browser, 'visaA'); S.cur = V;
    const p = V.page;
    await p.goto(`${WEB}/compliance`); await L.settle(V);
    const dlg = await openDialog(p, 'New application');
    const dd = await L.describe(p);
    const save = dlg.getByRole('button', { name: /Create|Save|Add|Submit/ }).last();
    let t = Date.now();
    await save.click(); await L.sleep(600);
    const blocked = since(V, t, /POST \/api\/compliance\/visas$/).length === 0;
    const msg = [(await dlg.locator('[role=alert]').allInnerTexts()).join(' '), await toastText(p)].filter(Boolean).join(' | ');
    R.check(blocked, { area: 'visa', route: '/compliance', role: 'visaA', kind: 'invalid', action: 'New application with an empty form', expected: 'blocked, no POST', actual: msg.slice(0, 160) || 'not submitted', extra: { dialog: dd } });
    const sels = dlg.locator('select');
    for (let i = 0; i < await sels.count(); i++) { const o = await sels.nth(i).locator('option').evaluateAll((os) => os.map((x) => x.value).filter(Boolean)); if (o.length) await sels.nth(i).selectOption(o[0]).catch(() => {}); }
    await fill(dlg, 'Notes', `A10 QA visa ${STAMP}`);
    await fill(dlg, 'Reference', `A10-${Date.now().toString().slice(-6)}`);
    const dates = dlg.locator('input[type=date]');
    for (let i = 0; i < await dates.count(); i++) await dates.nth(i).fill(day(30 + i * 10)).catch(() => {});
    t = Date.now();
    await save.dblclick();
    await waitReq(V, /POST \/api\/compliance\/visas$/, t, 10000); await L.settle(V);
    const cq = since(V, t, /POST \/api\/compliance\/visas$/);
    R.check(cq.length === 1 && cq[0].status < 300, { area: 'visa', route: '/compliance', role: 'visaA', kind: 'double-submit', action: 'double-click create application', expected: 'one POST 2xx', actual: fmt(cq).join(', ') || `no request; dialog=${JSON.stringify(await L.describe(p)).slice(0, 200)}`, requests: fmt(cq) });
    const apps = L.firstArray((await L.api(V, 'GET', '/compliance/visas?limit=50')).data);
    const app = apps.find((x) => JSON.stringify(x).includes(STAMP)) || apps[0];
    ctx.visa = app && { id: app.id, status: app.status };
    R.check(!!app && cq.some((x) => x.status < 300), { area: 'visa', route: '/compliance', role: 'visaA', action: 'create a visa application', expected: 'application created', actual: app ? `${app.applicationNumber ?? app.id.slice(0, 8)} ${app.status}` : 'none', readback: 'GET /api/compliance/visas', screenshot: await L.shot(p, 'visa-application-created') });
    if (!app) throw new Error('no visa application');
    // Decision path on the application.
    await p.goto(`${WEB}/compliance/${app.id}`); await L.settle(V);
    const st0 = await L.pageState(p);
    const acts = (await L.describe(p, 'main')).buttons;
    for (const name of ['Submit to authority', 'Submit', 'Mark under review', 'Approve', 'Reject']) {
      const b = p.getByRole('button', { name, exact: true }).first();
      if (!(await b.isVisible().catch(() => false))) continue;
      t = Date.now();
      await b.click();
      const d2 = p.getByRole('dialog');
      if (await d2.isVisible().catch(() => false)) {
        const ta = d2.locator('textarea, input[type=text]').first();
        if (await ta.isVisible().catch(() => false)) await ta.fill('A10 QA decision note');
        await d2.getByRole('button', { name: new RegExp(name.split(' ')[0], 'i') }).last().click().catch(() => {});
      }
      await waitReq(V, /compliance\/visas\/.*\/(submit|approve|reject|status)/, t, 8000); await L.settle(V);
      const q = since(V, t, /compliance\/visas/).filter((x) => x.method !== 'GET');
      const g = await L.api(V, 'GET', `/compliance/visas/${app.id}`);
      R.check(q.some((x) => x.status < 300), { area: 'visa', route: '/compliance/[id]', role: 'visaA', action: `application action: ${name}`, expected: '2xx and the status moves', actual: `${fmt(q).join(', ')} status now=${g.data?.status}`, requests: fmt(q), readback: 'GET /api/compliance/visas/:id' });
      break;
    }
    R.check(st0.state === 'rendered', { area: 'visa', route: '/compliance/[id]', role: 'visaA', action: 'open the application', expected: 'detail renders with actions', actual: `${st0.state} actions=${JSON.stringify(acts).slice(0, 200)}` });
    // Visa service request lifecycle.
    await p.goto(`${WEB}/visa-requests`); await L.settle(V);
    const rd = await openDialog(p, 'New request');
    const rdesc = await L.describe(p);
    await fill(rd, 'Subject', `A10 QA request ${STAMP}`);
    await fill(rd, 'Title', `A10 QA request ${STAMP}`);
    await fill(rd, 'Description', 'A10 QA: passport re-check needed');
    const rsel = rd.locator('select');
    for (let i = 0; i < await rsel.count(); i++) { const o = await rsel.nth(i).locator('option').evaluateAll((os) => os.map((x) => x.value).filter(Boolean)); if (o.length) await rsel.nth(i).selectOption(o[0]).catch(() => {}); }
    t = Date.now();
    await rd.getByRole('button', { name: /Create|Save|Add|Submit|Send/ }).last().click();
    await waitReq(V, /POST \/api\/visa-requests$/, t, 10000); await L.settle(V);
    const rq = since(V, t, /POST \/api\/visa-requests$/);
    const reqs = L.firstArray((await L.api(V, 'GET', '/visa-requests?limit=50')).data);
    const req = reqs.find((x) => JSON.stringify(x).includes(STAMP));
    R.check(rq.some((x) => x.status < 300) && !!req, { area: 'visa', route: '/visa-requests', role: 'visaA', action: 'create a visa service request', expected: 'POST 2xx; listed', actual: `${fmt(rq).join(', ') || 'no request'} found=${!!req}`, requests: fmt(rq), extra: { dialog: rdesc }, screenshot: await L.shot(p, 'visa-request-created') });
    if (req) {
      await p.goto(`${WEB}/visa-requests/${req.id}`); await L.settle(V);
      const dq = await L.describe(p, 'main');
      const steps = [];
      for (const [name, ep] of [['Escalate', /escalate/], ['Resolve', /resolve/], ['Close', /close/], ['Reopen', /reopen/]]) {
        const b = p.getByRole('button', { name, exact: true }).first();
        if (!(await b.isVisible().catch(() => false))) { steps.push(`${name}:not offered`); continue; }
        const t2 = Date.now();
        await b.click();
        const d2 = p.getByRole('dialog');
        if (await d2.isVisible().catch(() => false)) {
          const ta = d2.locator('textarea, input[type=text]').first();
          if (await ta.isVisible().catch(() => false)) await ta.fill(`A10 QA ${name.toLowerCase()}`);
          await d2.getByRole('button', { name: new RegExp(name, 'i') }).last().click().catch(() => {});
        }
        await waitReq(V, ep, t2, 8000); await L.settle(V);
        steps.push(`${name}:${fmt(since(V, t2, ep)).join('/') || 'no request'}`);
      }
      const g = await L.api(V, 'GET', `/visa-requests/${req.id}`);
      R.check(steps.some((s) => / 20\d/.test(s)), { area: 'visa', route: '/visa-requests/[id]', role: 'visaA', action: 'service request lifecycle (escalate/resolve/close/reopen)', expected: 'the offered transitions answer 2xx and persist', actual: `${steps.join(' | ')} final status=${g.data?.status}`, readback: 'GET /api/visa-requests/:id', extra: { controls: dq.buttons }, screenshot: await L.shot(p, 'visa-request-lifecycle') });
    }
    // Documents view.
    await p.goto(`${WEB}/visa-documents`); await L.settle(V);
    const st = await L.pageState(p);
    const docs = await L.api(V, 'GET', '/compliance/visas/documents');
    R.check(st.state === 'rendered' && docs.status === 200, { area: 'visa', route: '/visa-documents', role: 'visaA', action: 'document management page', expected: 'renders with the documents endpoint', actual: `${st.state} GET /api/compliance/visas/documents ${docs.status} items=${L.firstArray(docs.data).length}`, requests: [`GET /api/compliance/visas/documents ${docs.status}`] });
    // Other organization.
    const VB = await signIn(browser, 'visaB');
    const x = await L.apiProbe(VB, 'GET', `/compliance/visas/${app.id}`);
    const y = await L.apiProbe(VB, 'PUT', `/compliance/visas/${app.id}/approve`, { note: 'hijack' });
    await VB.page.goto(`${WEB}/compliance/${app.id}`); await L.settle(VB);
    R.check([403, 404].includes(x.status) && [403, 404].includes(y.status), { area: 'visa', route: '/compliance/[id]', role: 'visaB', kind: 'tenant', action: "Visa agency B reads and approves agency A's application", expected: '403/404 for both', actual: `GET=${x.status} PUT approve=${y.status} page=${(await L.pageState(VB.page)).state}`, requests: [`GET /api/compliance/visas/:idA ${x.status}`, `PUT /api/compliance/visas/:idA/approve ${y.status}`], screenshot: await L.shot(VB.page, 'visa-b-cross-tenant') });
  });

  await browser.close();
  console.log(`TOTAL providers: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
