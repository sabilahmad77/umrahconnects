/* A10 — operator journeys (Operator A admin), staff and finance-scoped checks.
 * Pilgrims CRUD + documents + traveler invitation; packages; bookings; invoices, payments, refunds; reports. */
'use strict';
const L = require('./lib');
const ONLY = process.argv.slice(2);
const R = new L.Recorder(ONLY.length ? `operator-rerun-${ONLY.join('-')}` : 'operator');
const WEB = L.WEB;
const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (arr) => arr.map((n) => `${n.method} ${n.path} ${n.status}`);
const body = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
async function waitReq(id, re, t0, ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { if (since(id, t0, re).length) return true; await L.sleep(150); } return false; }
async function toastText(page) { return page.locator('[data-sonner-toast]').allInnerTexts().then((a) => a.join(' | ').replace(/\s+/g, ' ')).catch(() => ''); }
const STAMP = `a10-${Date.now().toString(36)}`;
const ctx = {};
const S = {};

async function section(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t = Date.now();
  try { await fn(); console.log(`[${name}] ok in ${Math.round((Date.now() - t) / 1000)}s`); }
  catch (e) {
    const page = S.cur?.page;
    const d = page ? await L.describe(page) : null;
    console.log(`[${name}] EXCEPTION ${e.message.split('\n')[0]} :: ${JSON.stringify(d).slice(0, 600)}`);
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
  if (lr.outcome !== 'signed-in') throw new Error(`${key} sign-in failed: ${JSON.stringify(lr)}`);
  S[key] = id;
  return id;
}

(async () => {
  if (!ONLY.length) R.reset();
  const browser = await L.launch();
  const A = await signIn(browser, 'operatorAdminA');
  S.cur = A;
  const p = A.page;

  // ── Pilgrims: create / validate / edit / documents / archive ─────────────
  await section('pilgrims', async () => {
    await p.goto(`${WEB}/pilgrims`); await L.settle(A);
    const dlg = await openDialog(p, 'Add Pilgrim');
    const add = dlg.getByRole('button', { name: 'Add pilgrim' });
    R.check(await add.isDisabled(), { area: 'pilgrims', route: '/pilgrims', role: 'operatorAdminA', kind: 'invalid', action: 'Add pilgrim with empty first/last name', expected: 'Add pilgrim disabled', actual: `disabled=${await add.isDisabled()}` });
    await dlg.getByLabel('First Name').fill('A10');
    await dlg.getByLabel('Last Name').fill(`Pilgrim ${STAMP}`);
    await dlg.getByLabel('Email').fill(`a10.pilgrim.${STAMP}@qa.umrahconnect.test`);
    await dlg.getByLabel('Phone').fill('+966500000001');
    const nat = await dlg.getByLabel('Nationality').locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    if (nat.length) await dlg.getByLabel('Nationality').selectOption(nat.find((n) => /PK|SA|GB|EG/.test(n)) || nat[0]);
    await dlg.getByLabel('Passport Number').fill(`A10${Date.now().toString().slice(-7)}`);
    await dlg.getByLabel('Passport Expiry').fill(day(900));
    await dlg.getByLabel('Date Of Birth').fill('1990-05-17');
    let t = Date.now();
    await add.dblclick();
    await waitReq(A, /POST \/api\/pilgrims$/, t); await L.settle(A);
    const cr = since(A, t, /POST \/api\/pilgrims$/);
    R.check(cr.length === 1 && cr[0].status < 300, { area: 'pilgrims', route: '/pilgrims', role: 'operatorAdminA', kind: 'double-submit', action: 'double-click Add pilgrim', expected: 'exactly one POST /pilgrims 2xx', actual: fmt(cr).join(', '), requests: fmt(cr) });
    const found = L.firstArray((await L.api(A, 'GET', `/pilgrims?search=${encodeURIComponent(STAMP)}`)).data);
    ctx.pilgrim = found[0] && { id: found[0].id };
    R.check(found.length >= 1, { area: 'pilgrims', route: '/pilgrims', role: 'operatorAdminA', action: 'add a pilgrim', expected: 'created; toast "Pilgrim added"', actual: `found=${found.length} toast="${(await toastText(p)).slice(0, 60)}"`, requests: fmt(cr), readback: 'GET /api/pilgrims?search=<stamp>', screenshot: await L.shot(p, 'operator-pilgrim-added') });
    if (!ctx.pilgrim) throw new Error('pilgrim not created');
    // Search + persistence after refresh.
    await p.reload(); await L.settle(A);
    await p.getByLabel('Search').fill(STAMP);
    t = Date.now();
    await waitReq(A, /pilgrims\?.*search=/, t, 5000); await L.settle(A);
    const rows = await p.locator('main table tbody tr').count();
    R.check(rows >= 1 && (await body(p)).includes(STAMP), { area: 'pilgrims', route: '/pilgrims', role: 'operatorAdminA', kind: 'persist', action: 'search the new pilgrim after refresh', expected: 'the new pilgrim is found', actual: `rows=${rows}` });
    ctx.dupRows = rows;
    // Edit from the list.
    await p.locator('main table tbody tr').first().locator('button[title="Edit"]').click();
    const ed = p.getByRole('dialog'); await ed.waitFor();
    await ed.getByLabel('Phone').fill('+966500000002');
    t = Date.now();
    await ed.getByRole('button', { name: 'Save changes' }).click();
    await waitReq(A, /PUT \/api\/pilgrims\//, t); await L.settle(A);
    const g1 = await L.api(A, 'GET', `/pilgrims/${ctx.pilgrim.id}`);
    R.check(since(A, t, /PUT \/api\/pilgrims/).some((x) => x.status < 300) && g1.data?.phone === '+966500000002', { area: 'pilgrims', route: '/pilgrims', role: 'operatorAdminA', action: 'edit pilgrim phone from the list', expected: 'PUT 2xx; phone saved', actual: `${fmt(since(A, t, /PUT \/api\/pilgrims/)).join(',')} phone=${g1.data?.phone}`, readback: 'GET /api/pilgrims/:id' });
    // Detail page: edit + documents.
    await p.goto(`${WEB}/pilgrims/${ctx.pilgrim.id}`); await L.settle(A);
    const st = await L.pageState(p);
    R.check(st.h1.join(' ').includes(STAMP), { area: 'pilgrims', route: '/pilgrims/[id]', role: 'operatorAdminA', action: 'open pilgrim detail', expected: 'heading is the pilgrim name', actual: JSON.stringify(st.h1) });
    await p.getByRole('button', { name: 'Edit', exact: true }).click();
    await p.getByLabel('Last name (EN)').fill(`Pilgrim ${STAMP} Edited`);
    t = Date.now();
    await p.getByRole('button', { name: 'Save pilgrim' }).click();
    await waitReq(A, /PUT \/api\/pilgrims\//, t); await L.settle(A);
    await p.reload(); await L.settle(A);
    R.check((await L.pageState(p)).h1.join(' ').includes('Edited'), { area: 'pilgrims', route: '/pilgrims/[id]', role: 'operatorAdminA', kind: 'persist', action: 'edit pilgrim on detail page; refresh', expected: 'new name persists', actual: JSON.stringify((await L.pageState(p)).h1), requests: fmt(since(A, t, /PUT \/api\/pilgrims/)) });
    await p.getByRole('tab', { name: 'Documents' }).or(p.getByRole('button', { name: 'Documents', exact: true })).first().click();
    await L.settle(A);
    const addDoc = p.getByRole('button', { name: /Add document|Add/ }).last();
    t = Date.now();
    await addDoc.click(); await L.sleep(600);
    const noReq = since(A, t, /POST \/api\/pilgrims\/.*\/documents/).length === 0;
    R.check(noReq && /File name \+ URL required|required/i.test(await toastText(p)), { area: 'pilgrims', route: '/pilgrims/[id]', role: 'operatorAdminA', kind: 'invalid', action: 'add a document without file name and URL', expected: '"File name + URL required", no request', actual: `toast="${(await toastText(p)).slice(0, 80)}" requests=${noReq ? 0 : 'sent'}` });
    await p.locator('label:has-text("File name") input').first().fill(`passport-${STAMP}.pdf`);
    await p.locator('label:has-text("Public URL") input').first().fill(`https://example.com/a10/${STAMP}.pdf`);
    t = Date.now();
    await addDoc.click();
    await waitReq(A, /POST \/api\/pilgrims\/.*\/documents/, t); await L.settle(A);
    const dq = since(A, t, /documents/);
    R.check(dq.some((x) => x.status < 300) && (await body(p)).includes(`passport-${STAMP}.pdf`), { area: 'pilgrims', route: '/pilgrims/[id]', role: 'operatorAdminA', action: 'add a pilgrim document', expected: 'POST 2xx; listed', actual: fmt(dq).join(','), requests: fmt(dq) });
    // Archive: the duplicate from the double-click if there is one, otherwise nothing is archived here.
    const all = L.firstArray((await L.api(A, 'GET', `/pilgrims?search=${encodeURIComponent(STAMP)}`)).data).filter((x) => x.id !== ctx.pilgrim.id);
    if (all.length) {
      await p.goto(`${WEB}/pilgrims/${all[0].id}`); await L.settle(A);
      t = Date.now();
      await p.getByRole('button', { name: 'Archive', exact: true }).click();
      const cd = p.getByRole('dialog');
      if (await cd.isVisible().catch(() => false)) await cd.getByRole('button', { name: /Archive/ }).last().click();
      await waitReq(A, /DELETE \/api\/pilgrims\//, t); await L.settle(A);
      const after = L.firstArray((await L.api(A, 'GET', `/pilgrims?search=${encodeURIComponent(STAMP)}`)).data).map((x) => x.id);
      R.check(since(A, t, /DELETE \/api\/pilgrims/).some((x) => x.status < 300) && !after.includes(all[0].id), { area: 'pilgrims', route: '/pilgrims/[id]', role: 'operatorAdminA', action: 'archive a pilgrim (the duplicate)', expected: 'DELETE 2xx; no longer listed', actual: `${fmt(since(A, t, /DELETE/)).join(',')} stillListed=${after.includes(all[0].id)} path=${new URL(p.url()).pathname}` });
    }
  });

  // ── Traveler invitation (account access) ─────────────────────────────────
  await section('invite', async () => {
    if (!ctx.pilgrim) throw new Error('no pilgrim');
    await p.goto(`${WEB}/pilgrims/${ctx.pilgrim.id}`); await L.settle(A);
    await p.getByRole('tab', { name: 'Traveler access' }).or(p.getByRole('button', { name: 'Traveler access', exact: true })).first().click();
    await L.settle(A);
    await p.getByRole('button', { name: 'Invite traveler' }).click();
    const dlg = p.getByRole('dialog'); await dlg.waitFor();
    const email = dlg.locator('#traveler-invite-email');
    const send = dlg.getByRole('button', { name: 'Send invitation' });
    await email.fill('');
    R.check(await send.isDisabled(), { area: 'pilgrims', route: '/pilgrims/[id]', role: 'operatorAdminA', kind: 'invalid', action: 'Send invitation with no email', expected: 'disabled', actual: `disabled=${await send.isDisabled()}` });
    await email.fill('not-an-email');
    let t = Date.now();
    await send.click(); await L.sleep(1200);
    const bad = since(A, t, /account-links/);
    const badMsg = (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ');
    R.check(bad.every((x) => x.status >= 400) && (await dlg.isVisible()), { area: 'pilgrims', route: '/pilgrims/[id]', role: 'operatorAdminA', kind: 'invalid', action: 'Send invitation to an invalid email', expected: 'blocked (browser validation or 4xx), dialog stays open', actual: `${fmt(bad).join(',') || 'no request (browser validation)'} | ${badMsg.slice(0, 140)}` });
    await email.fill(`a10.pilgrim.${STAMP}@qa.umrahconnect.test`);
    t = Date.now();
    await send.dblclick();
    await waitReq(A, /POST \/api\/pilgrims\/.*\/account-links$/, t); await L.settle(A);
    const iq = since(A, t, /POST \/api\/pilgrims\/.*\/account-links$/);
    const waiting = (await body(p)).includes('Invitation waiting for the traveler');
    R.check(iq.filter((x) => x.status < 300).length === 1 && waiting, { area: 'pilgrims', route: '/pilgrims/[id]', role: 'operatorAdminA', action: 'invite the traveler (double-click Send invitation)', expected: 'one invitation created; "Invitation waiting for the traveler"', actual: `${fmt(iq).join(', ')} waiting=${waiting}`, requests: fmt(iq), screenshot: await L.shot(p, 'operator-invite-waiting') });
    const before = L.firstArray((await L.api(A, 'GET', `/pilgrims/${ctx.pilgrim.id}/account-links`)).data)[0];
    t = Date.now();
    await p.getByRole('button', { name: 'Resend' }).click();
    await waitReq(A, /account-links\/.*\/resend/, t); await L.settle(A);
    const after = L.firstArray((await L.api(A, 'GET', `/pilgrims/${ctx.pilgrim.id}/account-links`)).data)[0];
    const rsToast = await toastText(p);
    R.check(since(A, t, /resend/).some((x) => x.status < 300) && (after?.sendCount ?? 0) === (before?.sendCount ?? 0) + 1, { area: 'pilgrims', route: '/pilgrims/[id]', role: 'operatorAdminA', action: 'Resend the invitation', expected: 'POST resend 2xx; send count +1', actual: `${fmt(since(A, t, /resend/)).join(',')} sendCount ${before?.sendCount}→${after?.sendCount} toast="${rsToast.slice(0, 160)}"`, readback: 'GET /api/pilgrims/:id/account-links' });
    await p.getByRole('button', { name: 'Withdraw' }).click();
    const wd = p.getByRole('dialog'); await wd.waitFor();
    const reason = wd.locator('#traveler-revoke-reason');
    await reason.fill('A10 QA withdraw');
    t = Date.now();
    await wd.getByRole('button').filter({ hasNotText: /^Cancel$/ }).last().click();
    await waitReq(A, /account-links\/.*\/revoke/, t); await L.settle(A);
    const after2 = L.firstArray((await L.api(A, 'GET', `/pilgrims/${ctx.pilgrim.id}/account-links`)).data)[0];
    R.check(since(A, t, /revoke/).some((x) => x.status < 300) && /REVOKED|WITHDRAWN|CANCEL/i.test(String(after2?.status)), { area: 'pilgrims', route: '/pilgrims/[id]', role: 'operatorAdminA', action: 'Withdraw the invitation (with reason)', expected: 'POST revoke 2xx; status revoked', actual: `${fmt(since(A, t, /revoke/)).join(',')} status=${after2?.status}` });
    // Invite travelerA to their fixture record at Operator A (accepted later with the emailed link, if available).
    const recs = L.firstArray((await L.api(A, 'GET', `/pilgrims?search=${encodeURIComponent('traveler.a@qa.umrahconnect.test')}`)).data);
    const rec = recs.find((x) => (x.email || '').toLowerCase() === 'traveler.a@qa.umrahconnect.test') || recs[0];
    if (rec) {
      const links = L.firstArray((await L.api(A, 'GET', `/pilgrims/${rec.id}/account-links`)).data);
      const open = links.find((l) => ['INVITED', 'ACTIVE'].includes(l.status));
      let res = open ? { status: 'existing', data: open } : await L.api(A, 'POST', `/pilgrims/${rec.id}/account-links`, {});
      ctx.travelerAInvite = { pilgrimId: rec.id, status: res.status, linkStatus: res.data?.status };
      R.rec({ area: 'pilgrims', route: '/pilgrims/[id]', role: 'operatorAdminA', action: 'invite travelerA to the Operator A record (for acceptance with the emailed link)', expected: 'invitation open', actual: `${res.status} link=${res.data?.status ?? '-'} existing=${!!open}`, result: (open || res.status < 300) ? 'PASS' : 'FAIL' });
    } else R.rec({ area: 'pilgrims', route: '/pilgrims', role: 'operatorAdminA', action: 'find travelerA record at Operator A', expected: 'record with traveler.a email', actual: 'not found', result: 'UNTESTED', reason: 'fixture record not found by email search' });
  });

  // ── Packages ──────────────────────────────────────────────────────────────
  await section('packages', async () => {
    await p.goto(`${WEB}/packages`); await L.settle(A);
    await p.getByRole('button', { name: 'New package' }).click();
    const dlg = p.getByRole('dialog'); await dlg.waitFor();
    const create = dlg.getByRole('button', { name: /Create|Save|Add/ }).last();
    let t = Date.now();
    await dlg.getByLabel('Name').fill('A');
    await create.click(); await L.sleep(500);
    const e1 = await toastText(p);
    await dlg.getByLabel('Name').fill(`A10 Package ${STAMP}`);
    await dlg.getByLabel('Price Adult').fill('0');
    await create.click(); await L.sleep(500);
    const e2 = await toastText(p);
    R.check(/at least 2 characters/.test(e1) && /adult price/i.test(e2) && since(A, t, /POST \/api\/packages/).length === 0, { area: 'packages', route: '/packages', role: 'operatorAdminA', kind: 'invalid', action: 'New package: 1-char name, then price 0', expected: 'two validation messages, no request', actual: `[${e1.slice(0, 70)}] [${e2.slice(0, 90)}]` });
    await dlg.getByLabel('Price Adult').fill('12000');
    await dlg.getByLabel('Duration Days').fill('14');
    await dlg.getByLabel('Maximum travellers').fill('40');
    t = Date.now();
    await create.dblclick();
    await waitReq(A, /POST \/api\/packages/, t); await L.settle(A);
    const pq = since(A, t, /POST \/api\/packages/);
    R.check(pq.length === 1 && pq[0].status < 300, { area: 'packages', route: '/packages', role: 'operatorAdminA', kind: 'double-submit', action: 'double-click create package', expected: 'one POST 2xx', actual: fmt(pq).join(', '), requests: fmt(pq) });
    await p.reload(); await L.settle(A);
    const pk = L.firstArray((await L.api(A, 'GET', '/packages?limit=100')).data).find((x) => (x.name || '').includes(STAMP));
    ctx.pkg = pk && { id: pk.id, name: pk.name };
    R.check(!!pk && (await body(p)).includes(STAMP), { area: 'packages', route: '/packages', role: 'operatorAdminA', kind: 'persist', action: 'new package listed after refresh', expected: 'listed', actual: pk ? `${pk.name} ${pk.status ?? ''}` : 'missing', readback: 'GET /api/packages', screenshot: await L.shot(p, 'operator-package-created') });
  });

  // ── Bookings ──────────────────────────────────────────────────────────────
  await section('bookings', async () => {
    await p.goto(`${WEB}/bookings`); await L.settle(A);
    const dlg = await openDialog(p, 'New booking');
    const sel = (label) => dlg.locator(`label:has-text("${label}") select`).first();
    const inp = (label) => dlg.locator(`label:has-text("${label}") input`).first();
    const submit = dlg.getByRole('button', { name: /Create|Save|Book/ }).last();
    const err = async () => (await dlg.locator('[role=alert]').allInnerTexts()).join(' ');
    await sel('Package').waitFor({ timeout: 15000 });
    await sel('Lead pilgrim').waitFor({ timeout: 15000 });
    let t = Date.now();
    const hasEmptyChoice = await sel('Package').locator('option[value=""]').count();
    const e1 = hasEmptyChoice ? 'an empty choice is offered' : 'n/a — a package and a lead pilgrim are preselected, so "nothing chosen" cannot be submitted from this form';
    const pkgOpts = await sel('Package').locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })));
    const pkgPick = pkgOpts.find((o) => ctx.pkg && o.t.includes(ctx.pkg.name)) || pkgOpts.find((o) => o.v);
    await sel('Package').selectOption(pkgPick.v);
    const leadOpts = await sel('Lead pilgrim').locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })));
    const lead = leadOpts.find((o) => o.t.includes(STAMP)) || leadOpts.find((o) => o.v);
    await sel('Lead pilgrim').selectOption(lead.v);
    await inp('Travellers').fill('0');
    await submit.click(); await L.sleep(300);
    const e2 = await err();
    await inp('Travellers').fill('2');
    await inp('Deposit').fill('999999');
    await submit.click(); await L.sleep(300);
    const e3 = await err();
    R.check(/number of travellers/.test(e2) && /deposit cannot be more/i.test(e3) && since(A, t, /POST \/api\/bookings/).length === 0, { area: 'bookings', route: '/bookings', role: 'operatorAdminA', kind: 'invalid', action: 'New booking: 0 travellers, then deposit greater than the total', expected: 'inline errors, no request', actual: `[${e2}] [${e3}] | nothing-chosen path: ${e1}` });
    await inp('Deposit').fill('1000');
    await dlg.locator('label:has-text("Notes") textarea').fill(`A10 QA booking ${STAMP}`);
    t = Date.now();
    await submit.dblclick();
    await waitReq(A, /POST \/api\/bookings/, t); await L.settle(A);
    const bq = since(A, t, /POST \/api\/bookings$/);
    R.check(bq.length === 1 && bq[0].status < 300, { area: 'bookings', route: '/bookings', role: 'operatorAdminA', kind: 'double-submit', action: 'double-click create booking', expected: 'one POST /bookings 2xx', actual: fmt(bq).join(', '), requests: fmt(bq) });
    const bk = L.firstArray((await L.api(A, 'GET', '/bookings?limit=50')).data).find((x) => JSON.stringify(x).includes(STAMP));
    ctx.booking = bk && { id: bk.id, ref: bk.bookingRef || bk.reference || bk.bookingNumber, status: bk.status };
    R.check(!!bk, { area: 'bookings', route: '/bookings', role: 'operatorAdminA', action: 'create a booking (package + lead pilgrim, 2 travellers, deposit 1000)', expected: 'booking created', actual: bk ? `${ctx.booking.ref} ${bk.status} total=${bk.totalAmountCents ?? bk.totalCents}` : 'not found', readback: 'GET /api/bookings', screenshot: await L.shot(p, 'operator-booking-created') });
    if (!bk) throw new Error('booking not created');
    await p.goto(`${WEB}/bookings/${bk.id}`); await L.settle(A);
    const st = await L.pageState(p);
    R.check(st.state === 'rendered' && st.h1.length > 0, { area: 'bookings', route: '/bookings/[id]', role: 'operatorAdminA', action: 'open booking detail', expected: 'detail renders', actual: `${JSON.stringify(st.h1)}` });
    // Next status.
    const next = p.getByLabel('Next status');
    if (await next.isVisible().catch(() => false)) {
      const opts = await next.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
      await next.selectOption(opts[0]);
      t = Date.now();
      const go = p.getByRole('button', { name: /Move|Update|Apply|Change/ }).first();
      if (await go.isVisible().catch(() => false)) await go.click();
      await waitReq(A, /PUT \/api\/bookings\/.*\/status/, t, 8000); await L.settle(A);
      const g = await L.api(A, 'GET', `/bookings/${bk.id}`);
      R.check(since(A, t, /status/).some((x) => x.status < 300) && g.data?.status === opts[0], { area: 'bookings', route: '/bookings/[id]', role: 'operatorAdminA', action: `move booking to ${opts[0]}`, expected: 'PUT status 2xx; persisted', actual: `${fmt(since(A, t, /status/)).join(',')} now=${g.data?.status}`, readback: 'GET /api/bookings/:id' });
    } else R.rec({ area: 'bookings', route: '/bookings/[id]', role: 'operatorAdminA', action: 'move booking status', expected: '"Next status" control', actual: JSON.stringify(await L.describe(p, 'main')).slice(0, 300), result: 'UNTESTED', reason: 'no status control visible on the overview tab' });
    // Payment tab: draft invoice from the booking.
    await p.getByRole('tab', { name: 'Payment' }).click(); await L.settle(A);
    const gen = p.getByRole('button', { name: /invoice/i }).first();
    if (await gen.isVisible().catch(() => false)) {
      t = Date.now();
      await gen.click();
      await waitReq(A, /generate-invoice/, t); await L.settle(A);
      R.check(since(A, t, /generate-invoice/).some((x) => x.status < 300), { area: 'bookings', route: '/bookings/[id]', role: 'operatorAdminA', action: 'create a draft invoice from the booking', expected: 'POST generate-invoice 2xx', actual: `${fmt(since(A, t, /generate-invoice/)).join(',')} toast="${(await toastText(p)).slice(0, 60)}"` });
    } else R.rec({ area: 'bookings', route: '/bookings/[id]', role: 'operatorAdminA', action: 'create a draft invoice from the booking', expected: 'invoice button on Payment tab', actual: JSON.stringify(await L.describe(p, 'main')).slice(0, 300), result: 'UNTESTED', reason: 'button not found' });
    // Cancel booking (return to the booking: creating the invoice navigates to it).
    await p.goto(`${WEB}/bookings/${bk.id}`); await L.settle(A);
    await p.getByRole('button', { name: 'Cancel booking' }).click();
    const cd = p.getByRole('dialog');
    if (await cd.isVisible().catch(() => false)) {
      const reasonBox = cd.locator('textarea, input[type=text]').first();
      if (await reasonBox.isVisible().catch(() => false)) await reasonBox.fill('A10 QA cancellation');
      t = Date.now();
      await cd.getByRole('button', { name: /Cancel booking|Confirm|Yes/ }).last().click();
    } else t = Date.now();
    await waitReq(A, /bookings\/.*\/cancel/, t); await L.settle(A);
    await p.reload(); await L.settle(A);
    const g2 = await L.api(A, 'GET', `/bookings/${bk.id}`);
    R.check(since(A, t, /cancel/).some((x) => x.status < 300) && g2.data?.status === 'CANCELLED', { area: 'bookings', route: '/bookings/[id]', role: 'operatorAdminA', kind: 'persist', action: 'cancel the booking; refresh', expected: 'POST cancel 2xx; CANCELLED persists', actual: `${fmt(since(A, t, /cancel/)).join(',')} now=${g2.data?.status}`, readback: 'GET /api/bookings/:id' });
  });

  // ── Finance: invoice lifecycle, manual payment, refund ───────────────────
  await section('finance', async () => {
    await p.goto(`${WEB}/finance`); await L.settle(A);
    const dlg = await openDialog(p, 'New invoice');
    const inp = (label) => dlg.locator(`label:has-text("${label}") input`).first();
    const submit = dlg.getByRole('button', { name: /Create|Save/ }).last();
    const err = async () => (await dlg.locator('[role=alert]').allInnerTexts()).join(' ');
    let t = Date.now();
    await submit.click(); await L.sleep(300); const e1 = await err();
    await inp('Customer name').fill(`A10 Customer ${STAMP}`);
    await inp('Customer email').fill('bad-email'); await submit.click(); await L.sleep(300); const e2 = await err();
    await inp('Customer email').fill(`a10.customer.${STAMP}@qa.umrahconnect.test`);
    await inp('Subtotal').fill('0'); await submit.click(); await L.sleep(300); const e3 = await err();
    await inp('Subtotal').fill('1500');
    await inp('Tax').fill('225');
    await inp('Due date').fill(day(-3)); await submit.click(); await L.sleep(300); const e4 = await err();
    R.check(/customer name is required/.test(e1) && /valid email/.test(e2) && /greater than zero/.test(e3) && /cannot be in the past/.test(e4) && since(A, t, /POST \/api\/finance\/invoices/).length === 0, { area: 'finance', route: '/finance', role: 'operatorAdminA', kind: 'invalid', action: 'New invoice: no name, bad email, subtotal 0, past due date', expected: 'four inline errors, no request', actual: `[${e1}] [${e2}] [${e3}] [${e4}]` });
    await inp('Due date').fill(day(20));
    t = Date.now();
    await submit.dblclick();
    await waitReq(A, /POST \/api\/finance\/invoices$/, t); await L.settle(A);
    const iq = since(A, t, /POST \/api\/finance\/invoices$/);
    R.check(iq.length === 1 && iq[0].status < 300, { area: 'finance', route: '/finance', role: 'operatorAdminA', kind: 'double-submit', action: 'double-click create invoice', expected: 'one POST 2xx', actual: fmt(iq).join(', '), requests: fmt(iq) });
    const inv = L.firstArray((await L.api(A, 'GET', '/finance/invoices?limit=50')).data).find((x) => JSON.stringify(x).includes(STAMP));
    ctx.invoice = inv && { id: inv.id, ref: inv.invoiceRef, status: inv.status, total: inv.totalCents ?? inv.totalAmountCents };
    R.check(!!inv && inv.status === 'DRAFT', { area: 'finance', route: '/finance', role: 'operatorAdminA', action: 'create a draft invoice (1500 + 225 tax)', expected: 'DRAFT invoice', actual: inv ? `${inv.invoiceRef} ${inv.status} total=${ctx.invoice.total}` : 'missing', readback: 'GET /api/finance/invoices' });
    if (!inv) throw new Error('invoice not created');
    await p.goto(`${WEB}/finance/invoices/${inv.id}`); await L.settle(A);
    t = Date.now();
    await p.getByRole('button', { name: 'Issue invoice' }).click();
    await waitReq(A, /PUT \/api\/finance\/invoices\/.*\/(issue|status)/, t); await L.settle(A);
    await p.reload(); await L.settle(A);
    const g1 = await L.api(A, 'GET', `/finance/invoices/${inv.id}`);
    R.check(g1.data?.status === 'ISSUED', { area: 'finance', route: '/finance/invoices/[id]', role: 'operatorAdminA', kind: 'persist', action: 'Issue invoice; refresh', expected: 'ISSUED', actual: `${fmt(since(A, t, /invoices/)).filter((x) => /PUT/.test(x)).join(',')} now=${g1.data?.status}`, readback: 'GET /api/finance/invoices/:id' });
    // Record a manual payment (partial).
    await p.getByRole('tab', { name: 'Payments' }).or(p.getByRole('button', { name: 'Payments', exact: true })).first().click(); await L.settle(A);
    const form = p.locator('main');
    const amount = p.getByLabel('Amount (SAR)', { exact: true });
    const date = p.getByLabel('Received on');
    await amount.fill('500');
    if (await date.isVisible().catch(() => false)) await date.fill(day(3));
    t = Date.now();
    await form.getByRole('button', { name: 'Record payment' }).click(); await L.sleep(500);
    const futErr = (await form.locator('[role=alert]').allInnerTexts()).join(' ');
    R.check(/cannot be in the future/.test(futErr) && since(A, t, /payments/).filter((x) => /POST/.test(x.method)).length === 0, { area: 'finance', route: '/finance/invoices/[id]', role: 'operatorAdminA', kind: 'invalid', action: 'record a payment dated in the future', expected: 'inline error, no request', actual: futErr || JSON.stringify(await L.describe(p, 'main')).slice(0, 200) });
    if (await date.isVisible().catch(() => false)) await date.fill(day(0));
    t = Date.now();
    await form.getByRole('button', { name: 'Record payment' }).dblclick();
    await waitReq(A, /POST \/api\/finance\/invoices\/.*\/payments/, t); await L.settle(A);
    const pq = since(A, t, /POST \/api\/finance\/invoices\/.*\/payments/);
    const g2 = await L.api(A, 'GET', `/finance/invoices/${inv.id}`);
    R.check(pq.filter((x) => x.status < 300).length === 1, { area: 'finance', route: '/finance/invoices/[id]', role: 'operatorAdminA', kind: 'double-submit', action: 'double-click Record payment (SAR 500)', expected: 'exactly one payment recorded', actual: fmt(pq).join(', '), requests: fmt(pq) });
    R.check(/PARTIAL/.test(String(g2.data?.status)), { area: 'finance', route: '/finance/invoices/[id]', role: 'operatorAdminA', action: 'record a partial manual payment', expected: 'invoice PARTIALLY paid', actual: `status=${g2.data?.status} paid=${g2.data?.paidCents ?? g2.data?.amountPaidCents}`, readback: 'GET /api/finance/invoices/:id', screenshot: await L.shot(p, 'operator-invoice-partial') });
    // Refund that payment.
    const refundBtn = p.getByRole('button', { name: /^Refund payment of/ }).first();
    if (await refundBtn.isVisible().catch(() => false)) {
      await refundBtn.click();
      const rd = p.getByRole('dialog'); await rd.waitFor();
      const reason = rd.getByLabel('Reason');
      await reason.fill('x');
      t = Date.now();
      await rd.getByRole('button', { name: /Refund/ }).last().click(); await L.sleep(500);
      const rerr = (await rd.locator('[role=alert]').allInnerTexts()).join(' ');
      R.check(/at least 3 characters/.test(rerr) && since(A, t, /refund/).length === 0, { area: 'finance', route: '/finance/invoices/[id]', role: 'operatorAdminA', kind: 'invalid', action: 'refund with a 1-character reason', expected: 'inline error, no request', actual: rerr });
      await reason.fill('A10 QA refund');
      t = Date.now();
      await rd.getByRole('button', { name: /Refund/ }).last().click();
      await waitReq(A, /refund/, t); await L.settle(A);
      const rq = since(A, t, /refund/);
      R.check(rq.some((x) => x.status < 300), { area: 'finance', route: '/finance/invoices/[id]', role: 'operatorAdminA', action: 'refund the manual payment', expected: 'refund 2xx; "Refund recorded"', actual: `${fmt(rq).join(',')} toast="${(await toastText(p)).slice(0, 60)}"`, requests: fmt(rq) });
    } else R.rec({ area: 'finance', route: '/finance/invoices/[id]', role: 'operatorAdminA', action: 'refund a payment', expected: 'Refund button on the payment', actual: JSON.stringify(await L.describe(p, 'main')).slice(0, 300), result: 'UNTESTED', reason: 'refund control not found' });
    // Void after refund.
    await p.goto(`${WEB}/finance/invoices/${inv.id}`); await L.settle(A);
    const voidBtn = p.getByRole('button', { name: 'Void invoice' });
    if (await voidBtn.isVisible().catch(() => false)) {
      t = Date.now();
      await voidBtn.click();
      const vd = p.getByRole('dialog');
      if (await vd.isVisible().catch(() => false)) await vd.getByRole('button', { name: /Void/ }).last().click();
      await waitReq(A, /invoices\/.*\/(void|status)/, t); await L.settle(A);
      const g3 = await L.api(A, 'GET', `/finance/invoices/${inv.id}`);
      R.check(g3.data?.status === 'VOID' || since(A, t, /void|status/).some((x) => x.status >= 400), { area: 'finance', route: '/finance/invoices/[id]', role: 'operatorAdminA', action: 'Void the invoice', expected: 'VOID (or a clear refusal while money is held)', actual: `${fmt(since(A, t, /void|status/)).join(',')} now=${g3.data?.status}` });
    }
    // Payments list shows the payment.
    await p.goto(`${WEB}/finance-payments`); await L.settle(A);
    const pl = await body(p);
    R.check(/Payments/.test(pl) && (pl.includes(inv.invoiceRef || '@@') || pl.includes('500')), { area: 'finance', route: '/finance-payments', role: 'operatorAdminA', action: 'payments list includes the recorded payment', expected: 'listed', actual: pl.includes(inv.invoiceRef || '@@') ? `invoice ${inv.invoiceRef} listed` : 'amount only' });
  });

  // ── Reports ───────────────────────────────────────────────────────────────
  await section('reports', async () => {
    await p.goto(`${WEB}/reports`); await L.settle(A);
    const calls = since(A, Date.now() - 30000, /\/api\/reports\//);
    const st = await L.pageState(p);
    const bad = calls.filter((x) => x.status >= 400);
    R.check(calls.length >= 5 && !bad.length && !st.errorAlerts.length, { area: 'reports', route: '/reports', role: 'operatorAdminA', action: 'reports page loads every report section', expected: 'all /reports/* calls 2xx; no error state', actual: `${fmt(calls).join(', ')} errors=${JSON.stringify(st.errorAlerts)}`, requests: fmt(calls), screenshot: await L.shot(p, 'operator-reports') });
    const t = Date.now();
    const dl = p.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await p.getByRole('button', { name: 'Export CSV' }).click();
    const d = await dl;
    await waitReq(A, /reports\/export/, t, 5000);
    if (d) await d.delete().catch(() => {});
    R.check(since(A, t, /reports\/export/).some((x) => x.status < 300) || !!d, { area: 'reports', route: '/reports', role: 'operatorAdminA', action: 'Export CSV', expected: 'export request 2xx (file not kept)', actual: `${fmt(since(A, t, /reports\/export/)).join(',')} download=${d ? d.suggestedFilename() : 'none'}` });
  });

  // ── Operator staff: day-to-day grants only ────────────────────────────────
  await section('staff', async () => {
    const T = await signIn(browser, 'operatorStaffA'); S.cur = T;
    const q = T.page;
    await q.goto(`${WEB}/pilgrims`); await L.settle(T);
    const archiveVisible = await q.locator('main table tbody tr').first().locator('button[title="Archive"]').isVisible().catch(() => false);
    const del = ctx.pilgrim ? await L.apiProbe(T, 'DELETE', `/pilgrims/${ctx.pilgrim.id}`) : { status: 'n/a' };
    R.check(!archiveVisible && del.status === 403, { area: 'pilgrims', route: '/pilgrims', role: 'operatorStaffA', kind: 'denied', action: 'staff cannot archive pilgrims (no crm:pilgrim:delete)', expected: 'no Archive control; API DELETE 403', actual: `archiveVisible=${archiveVisible} DELETE=${del.status}`, requests: [`DELETE /api/pilgrims/:id ${del.status}`] });
    await q.goto(`${WEB}/packages`); await L.settle(T);
    const np = await q.getByRole('button', { name: 'New package' }).isVisible().catch(() => false);
    const pp = await L.apiProbe(T, 'POST', '/packages', { name: `A10 staff probe ${STAMP}`, type: 'UMRAH', priceAdultCents: 100000 });
    R.check(!np && pp.status === 403, { area: 'packages', route: '/packages', role: 'operatorStaffA', kind: 'denied', action: 'staff cannot create packages (read only)', expected: 'no New package; API 403', actual: `button=${np} POST=${pp.status}`, requests: [`POST /api/packages ${pp.status}`] });
    await q.goto(`${WEB}/finance`); await L.settle(T);
    const ni = await q.getByRole('button', { name: 'New invoice' }).isVisible().catch(() => false);
    const ip = await L.apiProbe(T, 'POST', '/finance/invoices', { issuedToName: 'A10 staff probe', subtotalCents: 1000 });
    R.check(!ni && ip.status === 403, { area: 'finance', route: '/finance', role: 'operatorStaffA', kind: 'denied', action: 'staff cannot create invoices (read only)', expected: 'no New invoice; API 403', actual: `button=${ni} POST=${ip.status}`, requests: [`POST /api/finance/invoices ${ip.status}`] });
    await q.goto(`${WEB}/bookings`); await L.settle(T);
    R.check(await q.getByRole('button', { name: 'New booking' }).isVisible().catch(() => false), { area: 'bookings', route: '/bookings', role: 'operatorStaffA', action: 'staff can create bookings (booking:booking:create)', expected: 'New booking offered', actual: String(await q.getByRole('button', { name: 'New booking' }).isVisible().catch(() => false)) });
    S.cur = A;
  });

  // ── Finance manager (scoped) ──────────────────────────────────────────────
  await section('finance-manager', async () => {
    const F = await signIn(browser, 'financeA'); S.cur = F;
    const q = F.page;
    await q.goto(`${WEB}/finance`); await L.settle(F);
    const dlg = await openDialog(q, 'New invoice');
    const inp = (label) => dlg.locator(`label:has-text("${label}") input`).first();
    await inp('Customer name').fill(`A10 Finance Customer ${STAMP}`);
    await inp('Subtotal').fill('800');
    await inp('Due date').fill(day(15));
    let t = Date.now();
    await dlg.getByRole('button', { name: /Create|Save/ }).last().click();
    await waitReq(F, /POST \/api\/finance\/invoices$/, t); await L.settle(F);
    const inv = L.firstArray((await L.api(F, 'GET', '/finance/invoices?limit=50')).data).find((x) => JSON.stringify(x).includes(`Finance Customer ${STAMP}`));
    R.check(!!inv, { area: 'finance', route: '/finance', role: 'financeA', action: 'finance manager creates a draft invoice', expected: 'created', actual: inv ? `${inv.invoiceRef} ${inv.status}` : 'missing', requests: fmt(since(F, t, /invoices/)) });
    if (inv) {
      await q.goto(`${WEB}/finance/invoices/${inv.id}`); await L.settle(F);
      t = Date.now();
      await q.getByRole('button', { name: 'Issue invoice' }).click();
      await waitReq(F, /invoices\/.*\/(issue|status)/, t); await L.settle(F);
      await q.getByRole('tab', { name: 'Payments' }).or(q.getByRole('button', { name: 'Payments', exact: true })).first().click(); await L.settle(F);
      const form = q.locator('main');
      await q.getByLabel('Amount (SAR)', { exact: true }).fill('800');
      const date = q.getByLabel('Received on');
      if (await date.isVisible().catch(() => false)) await date.fill(day(0));
      t = Date.now();
      await form.getByRole('button', { name: 'Record payment' }).click();
      await waitReq(F, /invoices\/.*\/payments/, t); await L.settle(F);
      const g = await L.api(F, 'GET', `/finance/invoices/${inv.id}`);
      R.check(g.data?.status === 'PAID', { area: 'finance', route: '/finance/invoices/[id]', role: 'financeA', action: 'finance manager issues and records full payment', expected: 'PAID', actual: `status=${g.data?.status}`, requests: fmt(since(F, t, /payments/)), screenshot: await L.shot(q, 'finance-manager-invoice-paid') });
    }
    // Budget plan.
    await q.goto(`${WEB}/budget-plans`); await L.settle(F);
    const bd = await openDialog(q, 'New budget plan');
    const desc = await L.describe(q);
    const bin = (label) => bd.getByLabel(label);
    t = Date.now();
    await bd.getByRole('button', { name: /Create|Save/ }).last().click(); await L.sleep(500);
    const e1 = await toastText(q);
    R.check(/Client name is required/.test(e1) && since(F, t, /budget-plans/).filter((x) => x.method === 'POST').length === 0, { area: 'finance', route: '/budget-plans', role: 'financeA', kind: 'invalid', action: 'New budget plan without a client', expected: '"Client name is required", no request', actual: e1.slice(0, 100), extra: { dialog: desc } });
    await bin('Client name').fill(`A10 Client ${STAMP}`);
    const trav = bd.getByLabel('Number of travelers');
    if (await trav.isVisible().catch(() => false)) await trav.fill('4');
    t = Date.now();
    await bd.getByRole('button', { name: /Create|Save/ }).last().click();
    await waitReq(F, /POST \/api\/finance\/budget-plans/, t); await L.settle(F);
    const bp = since(F, t, /POST \/api\/finance\/budget-plans/);
    R.check(bp.some((x) => x.status < 300) && (await body(q)).includes(STAMP), { area: 'finance', route: '/budget-plans', role: 'financeA', action: 'create a budget plan', expected: 'POST 2xx; listed', actual: `${fmt(bp).join(',')} ${(await toastText(q)).slice(0, 60)}`, requests: fmt(bp) });
    // Denied: pilgrims, and another organization's invoice.
    const pg = await L.apiProbe(F, 'GET', '/pilgrims');
    R.check(pg.status === 403, { area: 'api-refusal', route: '/pilgrims', role: 'financeA', kind: 'denied', action: 'finance manager reads pilgrims via API', expected: '403', actual: String(pg.status) });
    const B = await signIn(browser, 'operatorAdminB');
    const bInv = L.firstArray((await L.api(B, 'GET', '/finance/invoices?limit=5')).data)[0];
    if (bInv) {
      const x = await L.apiProbe(F, 'GET', `/finance/invoices/${bInv.id}`);
      await q.goto(`${WEB}/finance/invoices/${bInv.id}`); await L.settle(F);
      const vis = (await body(q)).includes(bInv.invoiceRef || '@@@');
      R.check([403, 404].includes(x.status) && !vis, { area: 'finance', route: '/finance/invoices/[id]', role: 'financeA', kind: 'tenant', action: "finance manager opens Operator B's invoice", expected: 'API 403/404; not shown', actual: `API=${x.status} visible=${vis}`, requests: [`GET /api/finance/invoices/:idB ${x.status}`] });
    }
    S.cur = A;
  });

  await browser.close();
  console.log(`TOTAL operator: ${JSON.stringify(R.count)}`);
  require('fs').writeFileSync(require('path').join(L.RUNTIME, `operator-ctx-${ONLY.join('-') || 'all'}.json`), JSON.stringify({ STAMP, ...ctx }, null, 1));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
