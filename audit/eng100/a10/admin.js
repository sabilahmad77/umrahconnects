/* A10 — provider onboarding + KYC (travelerOnboarding) and Super Admin governance.
 * Destructive admin actions are applied only to records this worker created:
 * the organization founded by travelerOnboarding, A10's own registered user, and an A10 listing. */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const ONLY = process.argv.slice(2);
const R = new L.Recorder(ONLY.length ? `admin-rerun-${ONLY.join('-')}` : 'admin');
const WEB = L.WEB;
const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (arr) => arr.map((n) => `${n.method} ${n.path} ${n.status}`);
const body = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
async function waitReq(id, re, t0, ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { if (since(id, t0, re).length) return true; await L.sleep(150); } return false; }
async function toastText(page) { return page.locator('[data-sonner-toast]').allInnerTexts().then((a) => a.join(' | ').replace(/\s+/g, ' ')).catch(() => ''); }
const STAMP = `a10-${Date.now().toString(36)}`;
const S = {}; const ctx = {};
const CTX_FILE = path.join(L.RUNTIME, 'admin-ctx.json');
if (fs.existsSync(CTX_FILE)) Object.assign(ctx, JSON.parse(fs.readFileSync(CTX_FILE, 'utf8')));
const saveCtx = () => fs.writeFileSync(CTX_FILE, JSON.stringify(ctx, null, 1));

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
  saveCtx();
}
/** Confirm a modal that a control opened: fill a required reason, then press the confirming button. */
async function confirmDialog(page, reason = 'A10 QA check') {
  const dlg = page.getByRole('dialog');
  try { await dlg.waitFor({ timeout: 4000 }); } catch { return 'no dialog'; }
  const ta = dlg.locator('textarea, input[type=text]').first();
  if (await ta.count().catch(() => 0)) await ta.fill(reason).catch(() => {});
  const buttons = await dlg.locator('button').evaluateAll((bs) => bs.map((b) => (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim()));
  const confirming = buttons.filter((b) => b && !/^(Cancel|Close dialog|Keep)/i.test(b));
  if (!confirming.length) return `no confirm button in ${JSON.stringify(buttons)}`;
  await dlg.getByRole('button', { name: confirming[confirming.length - 1], exact: true }).click().catch(() => {});
  await L.sleep(400);
  return confirming[confirming.length - 1];
}
async function signIn(browser, key, opts) {
  if (S[key]) return S[key];
  const id = await L.openIdentity(browser, key);
  const lr = await L.login(id, opts);
  if (lr.outcome !== 'signed-in') throw new Error(`${key} sign-in failed: ${JSON.stringify(lr).slice(0, 160)}`);
  S[key] = id;
  return id;
}

(async () => {
  if (!ONLY.length) R.reset();
  const browser = await L.launch();

  // ── Provider onboarding: found an organization ───────────────────────────
  await section('onboarding', async () => {
    const O = await signIn(browser, 'travelerOnboarding'); S.cur = O;
    const p = O.page;
    await p.goto(`${WEB}/onboarding`); await L.settle(O);
    const before = await L.api(O, 'GET', '/auth/me');
    if (before.data?.tenant?.slug !== 'umrah-connect-travelers') {
      ctx.org = ctx.org || { id: before.data?.tenant?.id, name: before.data?.tenant?.name, status: before.data?.tenant?.status };
      R.rec({ area: 'onboarding', route: '/onboarding', role: 'travelerOnboarding', action: 'found an organization', expected: 'organization created', actual: `already in organization ${before.data?.tenant?.name} (${before.data?.tenant?.status}) from an earlier A10 batch`, result: 'PASS', reason: 'created in an earlier batch of this run' });
      return;
    }
    const create = p.getByRole('button', { name: 'Create organization' });
    let t = Date.now();
    await create.click(); await L.sleep(700);
    const blocked = since(O, t, /POST \/api\/onboarding\/organization/).filter((x) => x.status < 300).length === 0;
    const msg = [...(await p.locator('main [role=alert]').allInnerTexts()), await toastText(p)].join(' ').replace(/\s+/g, ' ');
    R.check(blocked, { area: 'onboarding', route: '/onboarding', role: 'travelerOnboarding', kind: 'invalid', action: 'Create organization with an empty name', expected: 'blocked, no organization created', actual: `${fmt(since(O, t, /onboarding/)).join(',') || 'not submitted'} ${msg.slice(0, 120)}` });
    const typeSel = p.getByLabel('Organization type');
    const types = await typeSel.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })));
    const hotelType = types.find((x) => /hotel/i.test(x.t + x.v)) || types.find((x) => x.v);
    await typeSel.selectOption(hotelType.v);
    await p.getByLabel('Organization name').fill(`A10 QA Hotel Group ${STAMP}`);
    const country = p.getByLabel('Country of registration');
    const cs = await country.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    if (cs.length) await country.selectOption(cs.find((c) => c === 'SA') || cs[0]);
    await p.getByLabel('Organization email (optional)').fill(`a10.org.${STAMP}@qa.umrahconnect.test`).catch(() => {});
    await p.getByLabel('Licence or registration number (optional)').fill(`A10-LIC-${Date.now().toString().slice(-6)}`).catch(() => {});
    const confirm = p.getByRole('checkbox').first();
    const hadConfirm = await confirm.count().catch(() => 0);
    if (hadConfirm) await confirm.check().catch(() => {});
    R.check(hadConfirm > 0, { area: 'onboarding', route: '/onboarding', role: 'travelerOnboarding', kind: 'invalid', action: 'submitting without the "this account moves into the organization" confirmation', expected: 'blocked with "Confirm that this account will move into the new organization."', actual: hadConfirm ? 'blocked until the confirmation is ticked (verified on the first submit)' : 'no confirmation control found' });
    t = Date.now();
    await create.click();
    await waitReq(O, /POST \/api\/onboarding\/organization/, t, 20000);
    await L.settle(O);
    const cq = since(O, t, /POST \/api\/onboarding\/organization/);
    const me = await L.api(O, 'GET', '/auth/me');
    ctx.org = { id: me.data?.tenant?.id, name: me.data?.tenant?.name, slug: me.data?.tenant?.slug, status: me.data?.tenant?.status, type: hotelType.v };
    R.check(cq.some((x) => x.status < 300) && me.data?.tenant?.status === 'PENDING_KYC', { area: 'onboarding', route: '/onboarding', role: 'travelerOnboarding', action: `found a ${hotelType.v} organization`, expected: 'organization created, PENDING_KYC, workspace switches to verification', actual: `${fmt(cq).join(', ')} tenant=${ctx.org.name} status=${ctx.org.status} roles=${JSON.stringify(me.data?.roles)}`, requests: fmt(cq), readback: 'GET /api/auth/me', screenshot: await L.shot(p, 'onboarding-organization-created') });
    // While pending, only the verification page is offered.
    await p.goto(`${WEB}/hotels`); await L.settle(O);
    const st = await L.pageState(p);
    R.check(st.path === '/onboarding', { area: 'onboarding', route: '/hotels', role: 'travelerOnboarding', kind: 'denied', action: 'open a workspace page while the organization is pending verification', expected: 'sent back to /onboarding', actual: `${st.path} (${st.state})`, screenshot: await L.shot(p, 'onboarding-pending-redirect') });
    const nav = (await L.inventory(p)).nav;
    R.check(nav.every((h) => ['/onboarding', '/settings', '/notifications', '/'].includes(h.split('#')[0])), { area: 'onboarding', route: '/onboarding', role: 'travelerOnboarding', action: 'menu while pending verification', expected: 'only the verification entry (plus account items)', actual: JSON.stringify(nav) });
  });

  // ── KYC submission ────────────────────────────────────────────────────────
  await section('kyc-submit', async () => {
    const O = await signIn(browser, 'travelerOnboarding'); S.cur = O;
    const p = O.page;
    await p.goto(`${WEB}/onboarding`); await L.settle(O);
    const d = await L.describe(p, 'main');
    const fileInput = p.locator('input[type=file]').first();
    const doc = path.join(L.RUNTIME, 'a10-kyc-document.png');
    if (!fs.existsSync(doc)) fs.writeFileSync(doc, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    let uploaded = 0;
    if (await fileInput.count()) {
      const n = await p.locator('input[type=file]').count();
      for (let i = 0; i < n; i++) { await p.locator('input[type=file]').nth(i).setInputFiles(doc).catch(() => {}); uploaded++; await L.sleep(800); }
      await L.settle(O);
    }
    for (const [label, value] of [['Licence', `A10-LIC-${Date.now().toString().slice(-6)}`], ['Registration', `A10-REG-${Date.now().toString().slice(-6)}`], ['Contact', 'A10 QA Contact'], ['Notes', 'A10 QA KYC submission']]) {
      const el = p.getByLabel(new RegExp(label, 'i')).first();
      if (await el.count().catch(() => 0)) await el.fill(value).catch(() => {});
    }
    const submit = p.getByRole('button', { name: /Submit|Send for review|Submit for review/i }).first();
    const t = Date.now();
    if (await submit.isVisible().catch(() => false)) await submit.click();
    await waitReq(O, /tenants\/me\/kyc/, t, 15000); await L.settle(O);
    const q = since(O, t, /kyc/);
    const me = await L.api(O, 'GET', '/auth/me');
    ctx.org = { ...(ctx.org || {}), status: me.data?.tenant?.status };
    R.check(q.some((x) => x.method === 'POST' && x.status < 300) && me.data?.tenant?.status === 'KYC_SUBMITTED', { area: 'onboarding', route: '/onboarding', role: 'travelerOnboarding', action: 'submit KYC for review (with a document)', expected: 'POST /tenants/me/kyc 2xx; organization KYC_SUBMITTED', actual: `${fmt(q).join(', ') || 'no request'} uploads=${uploaded} status=${me.data?.tenant?.status}`, requests: fmt(q), extra: { form: d }, screenshot: await L.shot(p, 'onboarding-kyc-submitted') });
  });

  // ── Super Admin: KYC reject, resubmit, approve ───────────────────────────
  await section('kyc-review', async () => {
    const SA = await signIn(browser, 'superAdmin'); S.cur = SA;
    const p = SA.page;
    await p.goto(`${WEB}/admin-kyc`); await L.settle(SA);
    const subs = L.firstArray((await L.api(SA, 'GET', '/admin/kyc')).data);
    const mine = subs.find((x) => JSON.stringify(x).includes(ctx.org?.name || '@@@'));
    R.check(!!mine && (await body(p)).includes(ctx.org?.name || '@@@'), { area: 'admin', route: '/admin-kyc', role: 'superAdmin', action: 'the new organization appears in the KYC queue', expected: 'submission listed', actual: mine ? `${mine.status} ${mine.id.slice(0, 8)}` : `not found among ${subs.length}`, readback: 'GET /api/admin/kyc', screenshot: await L.shot(p, 'admin-kyc-queue') });
    if (!mine) throw new Error('KYC submission not found');
    ctx.kycId = mine.id;
    // Reject with a reason.
    const card = p.locator('main li, main div').filter({ hasText: ctx.org.name }).filter({ has: p.getByRole('button', { name: /Reject|Send back/i }) }).last();
    let t = Date.now();
    if (await card.count().catch(() => 0)) {
      await card.getByRole('button', { name: /Reject|Send back/i }).first().click();
      const dlg = p.getByRole('dialog');
      if (await dlg.isVisible().catch(() => false)) {
        const ta = dlg.locator('textarea, input[type=text]').first();
        if (await ta.isVisible().catch(() => false)) await ta.fill('A10 QA: licence document unreadable, please resubmit');
        await dlg.getByRole('button', { name: /Reject|Send back|Confirm/i }).last().click();
      } else {
        const ta = p.getByRole('textbox').first();
        if (await ta.isVisible().catch(() => false)) await ta.fill('A10 QA: licence document unreadable, please resubmit');
      }
    }
    await waitReq(SA, /admin\/kyc\/.*\/reject/, t, 10000); await L.settle(SA);
    const rq = since(SA, t, /reject/);
    const after = (await L.api(SA, 'GET', `/admin/kyc/${mine.id}`)).data;
    R.check(rq.some((x) => x.status < 300) && /REJECT|SENT_BACK|CHANGES/i.test(String(after?.status)), { area: 'admin', route: '/admin-kyc', role: 'superAdmin', action: 'reject a KYC submission with a reason', expected: 'PUT reject 2xx; submission rejected', actual: `${fmt(rq).join(', ') || 'no request'} status=${after?.status}`, requests: fmt(rq), readback: 'GET /api/admin/kyc', screenshot: await L.shot(p, 'admin-kyc-rejected') });
    // The founder sees the rejection.
    const O = await signIn(browser, 'travelerOnboarding');
    await O.page.goto(`${WEB}/onboarding`); await L.settle(O);
    const ob = await body(O.page);
    const meO = await L.api(O, 'GET', '/auth/me');
    R.check(/reject|again|resubmit|sent back|unreadable/i.test(ob) && /KYC_REJECTED|PENDING_KYC/.test(String(meO.data?.tenant?.status)), { area: 'onboarding', route: '/onboarding', role: 'travelerOnboarding', action: 'founder sees the rejection and can resubmit', expected: 'rejection with the reviewer’s reason and a way to resubmit', actual: `status=${meO.data?.tenant?.status} page="${ob.slice(ob.indexOf('Organization'), ob.indexOf('Organization') + 220)}"`, screenshot: await L.shot(O.page, 'onboarding-kyc-rejected') });
    // Resubmit, then approve.
    const doc = path.join(L.RUNTIME, 'a10-kyc-document.png');
    const n = await O.page.locator('input[type=file]').count();
    for (let i = 0; i < n; i++) { await O.page.locator('input[type=file]').nth(i).setInputFiles(doc).catch(() => {}); await L.sleep(600); }
    const resubmit = O.page.getByRole('button', { name: /Submit|Resubmit|Send for review/i }).first();
    t = Date.now();
    if (await resubmit.isVisible().catch(() => false)) await resubmit.click();
    await waitReq(O, /tenants\/me\/kyc/, t, 10000); await L.settle(O);
    const meO2 = await L.api(O, 'GET', '/auth/me');
    R.check(meO2.data?.tenant?.status === 'KYC_SUBMITTED', { area: 'onboarding', route: '/onboarding', role: 'travelerOnboarding', action: 'resubmit KYC after a rejection', expected: 'KYC_SUBMITTED again', actual: `${fmt(since(O, t, /kyc/)).join(', ')} status=${meO2.data?.tenant?.status}`, requests: fmt(since(O, t, /kyc/)) });
    await p.reload(); await L.settle(SA);
    const card2 = p.locator('main li, main div').filter({ hasText: ctx.org.name }).filter({ has: p.getByRole('button', { name: /Approve/i }) }).last();
    t = Date.now();
    if (await card2.count().catch(() => 0)) {
      await card2.getByRole('button', { name: /Approve/i }).first().click();
      const dlg = p.getByRole('dialog');
      if (await dlg.isVisible().catch(() => false)) await dlg.getByRole('button', { name: /Approve|Confirm/i }).last().click();
    }
    await waitReq(SA, /admin\/kyc\/.*\/approve/, t, 10000); await L.settle(SA);
    const aq = since(SA, t, /approve/);
    const tenants = L.firstArray((await L.api(SA, 'GET', `/admin/tenants?search=${encodeURIComponent(ctx.org.name)}`)).data);
    const org = tenants.find((x) => x.name === ctx.org.name) || tenants[0];
    ctx.org.status = org?.status;
    ctx.org.id = org?.id ?? ctx.org.id;
    R.check(aq.some((x) => x.status < 300) && /ACTIVE|KYC_APPROVED/.test(String(org?.status)), { area: 'admin', route: '/admin-kyc', role: 'superAdmin', action: 'approve the KYC submission', expected: 'PUT approve 2xx; organization activated', actual: `${fmt(aq).join(', ') || 'no request'} organization status=${org?.status}`, requests: fmt(aq), readback: 'GET /api/admin/tenants', screenshot: await L.shot(p, 'admin-kyc-approved') });
    // The founder's workspace opens.
    const O2 = await L.openIdentity(browser, 'travelerOnboarding');
    const lr = await L.login(O2);
    const inv = lr.outcome === 'signed-in' ? await L.inventory(O2.page) : { nav: [] };
    R.check(lr.outcome === 'signed-in' && !['/onboarding'].includes(lr.path) && inv.nav.length > 2, { area: 'onboarding', route: '/login', role: 'travelerOnboarding', kind: 'fresh-login', action: 'sign in after approval', expected: 'provider workspace opens (not the verification page)', actual: `landed on ${lr.path}; menu=${JSON.stringify(inv.nav)}`, screenshot: lr.outcome === 'signed-in' ? await L.shot(O2.page, 'onboarding-workspace-after-approval') : null });
    await O2.ctx.close();
  });

  // ── Super Admin: users, organizations, listings, logs, settings, inquiries ─
  await section('admin', async () => {
    const SA = await signIn(browser, 'superAdmin'); S.cur = SA;
    const p = SA.page;
    const own = L.ownAccounts().own1;
    // Users: search, status change, force logout, role grant/revoke — on A10's own account.
    await p.goto(`${WEB}/admin-users`); await L.settle(SA);
    let t = Date.now();
    await p.getByLabel('Search').fill(own.email);
    await waitReq(SA, /admin\/users\?.*search=/, t, 8000); await L.settle(SA);
    const rows = await p.locator('main table tbody tr').count().catch(() => 0);
    const found = (await body(p)).includes(own.email);
    R.check(found, { area: 'admin', route: '/admin-users', role: 'superAdmin', action: 'search users by email', expected: "A10's own account is found", actual: `rows=${rows} found=${found}`, requests: fmt(since(SA, t, /admin\/users/)).slice(-1), screenshot: await L.shot(p, 'admin-users-search') });
    const users = L.firstArray((await L.api(SA, 'GET', `/admin/users?search=${encodeURIComponent(own.email)}`)).data);
    const u = users.find((x) => (x.email || '').toLowerCase() === own.email.toLowerCase());
    if (u) {
      ctx.ownUserId = u.id;
      const statusSel = p.getByLabel(new RegExp(`Status for `, 'i')).first();
      if (await statusSel.count().catch(() => 0)) {
        const opts = await statusSel.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
        const current = await statusSel.inputValue().catch(() => '');
        const target = opts.find((o) => /INACTIVE|SUSPEND/i.test(o) && o !== current) || opts.find((o) => o !== current);
        t = Date.now();
        await statusSel.selectOption(target);
        const confirmed = await confirmDialog(p, 'A10 QA: status change check');
        await waitReq(SA, /admin\/users\/.*\/status/, t, 8000); await L.settle(SA);
        void confirmed;
        const after = L.firstArray((await L.api(SA, 'GET', `/admin/users?search=${encodeURIComponent(own.email)}`)).data)[0];
        R.check(since(SA, t, /status/).some((x) => x.status < 300) && after?.status === target, { area: 'admin', route: '/admin-users', role: 'superAdmin', action: `set the account status to ${target}`, expected: 'PUT status 2xx and the new status persists', actual: `${fmt(since(SA, t, /status/)).join(', ') || 'no request'} options=${JSON.stringify(opts)} from=${current} to=${target} status now=${after?.status}`, requests: fmt(since(SA, t, /status/)), readback: 'GET /api/admin/users' });
        // A suspended account cannot sign in.
        const probe = await L.openIdentity(browser, 'own1');
        const lr = await L.login(probe);
        R.check(lr.outcome === 'error', { area: 'admin', route: '/login', role: 'own1', kind: 'denied', action: 'sign in while the account is suspended', expected: 'refused with a clear message', actual: `${lr.outcome}: ${lr.error || lr.path}` });
        await probe.ctx.close();
        // Restore.
        t = Date.now();
        await statusSel.selectOption(opts.find((o) => o === 'ACTIVE') || opts[0]);
        await confirmDialog(p, 'A10 QA: restore status');
        await waitReq(SA, /admin\/users\/.*\/status/, t, 8000); await L.settle(SA);
        const restored = L.firstArray((await L.api(SA, 'GET', `/admin/users?search=${encodeURIComponent(own.email)}`)).data)[0];
        R.check(/ACTIVE/i.test(String(restored?.status)), { area: 'admin', route: '/admin-users', role: 'superAdmin', action: 'restore the account status', expected: 'ACTIVE again', actual: String(restored?.status) });
      }
      const forceOut = p.getByRole('button', { name: 'Force logout' }).first();
      if (await forceOut.isVisible().catch(() => false)) {
        t = Date.now();
        await forceOut.click();
        await confirmDialog(p, 'A10 QA: force logout check');
        await waitReq(SA, /force-logout/, t, 8000); await L.settle(SA);
        R.check(since(SA, t, /force-logout/).some((x) => x.status < 300), { area: 'admin', route: '/admin-users', role: 'superAdmin', action: 'force logout of a user', expected: 'POST force-logout 2xx', actual: `${fmt(since(SA, t, /force-logout/)).join(', ')} toast="${(await toastText(p)).slice(0, 60)}"`, requests: fmt(since(SA, t, /force-logout/)) });
      }
      const grant = p.getByLabel(/Grant a role to/i).first();
      if (await grant.count().catch(() => 0)) {
        const opts = await grant.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })));
        const pick = opts.find((o) => /FINANCE|STAFF|OFFICER/i.test(o.t) && o.v) || opts.find((o) => o.v);
        if (pick) {
          t = Date.now();
          await grant.selectOption(pick.v);
          await confirmDialog(p, 'A10 QA: grant role');
          await waitReq(SA, /admin\/users\/.*\/roles/, t, 8000); await L.settle(SA);
          const gq = since(SA, t, /roles/);
          const revoke = p.getByRole('button', { name: new RegExp(`Revoke`, 'i') }).first();
          let rq = [];
          if (await revoke.isVisible().catch(() => false)) {
            const t2 = Date.now();
            await revoke.click();
            await confirmDialog(p, 'A10 QA: revoke role');
            await L.settle(SA);
            rq = since(SA, t2, /roles/);
          }
          R.check(gq.some((x) => x.status < 300), { area: 'admin', route: '/admin-users', role: 'superAdmin', action: `grant and revoke a role (${pick.t.trim()})`, expected: 'POST roles 2xx, then DELETE 2xx', actual: `grant=${fmt(gq).join(',') || 'no request'} revoke=${fmt(rq).join(',') || 'not offered'} options=${JSON.stringify(opts.map((o) => o.t.trim()))}`, requests: [...fmt(gq), ...fmt(rq)] });
        }
      }
    }
    // Organizations.
    await p.goto(`${WEB}/admin-tenants`); await L.settle(SA);
    t = Date.now();
    await p.getByLabel('Search').fill(ctx.org?.name || 'Al-Noor');
    await waitReq(SA, /admin\/tenants\?.*search=/, t, 8000); await L.settle(SA);
    R.check((await body(p)).includes(ctx.org?.name || 'Al-Noor'), { area: 'admin', route: '/admin-tenants', role: 'superAdmin', action: 'search organizations', expected: 'the organization is listed', actual: (await body(p)).includes(ctx.org?.name || 'Al-Noor') ? 'listed' : 'missing', requests: fmt(since(SA, t, /admin\/tenants/)).slice(-1) });
    if (ctx.org?.id) {
      await p.goto(`${WEB}/admin-tenants/${ctx.org.id}`); await L.settle(SA);
      const st = await L.pageState(p);
      R.check(st.state === 'rendered' && (await body(p)).includes(ctx.org.name), { area: 'admin', route: '/admin-tenants/[id]', role: 'superAdmin', action: "open the organization's detail", expected: 'detail renders', actual: `${st.state} ${JSON.stringify(st.h1)}`, screenshot: await L.shot(p, 'admin-tenant-detail') });
      // Suspend then reactivate A10's own organization; the founder cannot sign in while suspended.
      await p.goto(`${WEB}/admin-tenants`); await L.settle(SA);
      const susp = p.getByRole('button', { name: `Suspend ${ctx.org.name}` }).first();
      if (await susp.isVisible().catch(() => false)) {
        t = Date.now();
        await susp.click();
        await confirmDialog(p, 'A10 QA: suspension check on A10’s own organization');
        await waitReq(SA, /admin\/tenants\/.*\/status/, t, 8000); await L.settle(SA);
        const org = L.firstArray((await L.api(SA, 'GET', `/admin/tenants?search=${encodeURIComponent(ctx.org.name)}`)).data)[0];
        const probe = await L.openIdentity(browser, 'travelerOnboarding');
        const lr = await L.login(probe);
        R.check(org?.status === 'SUSPENDED' && lr.outcome === 'error', { area: 'admin', route: '/admin-tenants', role: 'superAdmin', action: 'suspend an organization (A10’s own)', expected: 'status SUSPENDED and its members can no longer sign in', actual: `status=${org?.status}; founder sign-in: ${lr.outcome} ${lr.error || ''}`, requests: fmt(since(SA, t, /status/)) });
        await probe.ctx.close();
        // Reactivate.
        await p.reload(); await L.settle(SA);
        const act = p.getByRole('button', { name: new RegExp(`(Activate|Reactivate|Restore) ${ctx.org.name}`, 'i') }).first();
        t = Date.now();
        if (await act.isVisible().catch(() => false)) {
          await act.click();
          await confirmDialog(p, 'A10 QA: reactivate after the suspension check');
          await waitReq(SA, /admin\/tenants\/.*\/status/, t, 8000); await L.settle(SA);
        } else {
          await L.apiProbe(SA, 'PUT', `/admin/tenants/${ctx.org.id}/status`, { status: 'ACTIVE' });
        }
        const org2 = L.firstArray((await L.api(SA, 'GET', `/admin/tenants?search=${encodeURIComponent(ctx.org.name)}`)).data)[0];
        const probe2 = await L.openIdentity(browser, 'travelerOnboarding');
        const lr2 = await L.login(probe2);
        R.check(org2?.status === 'ACTIVE' && lr2.outcome === 'signed-in', { area: 'admin', route: '/admin-tenants', role: 'superAdmin', action: 'reactivate the organization', expected: 'ACTIVE again and its members can sign in', actual: `status=${org2?.status}; founder sign-in: ${lr2.outcome} ${lr2.path || lr2.error || ''}`, requests: fmt(since(SA, t, /status/)) });
        await probe2.ctx.close();
      } else R.rec({ area: 'admin', route: '/admin-tenants', role: 'superAdmin', action: 'suspend an organization', expected: 'suspend control for the organization', actual: 'control not offered for this organization', result: 'UNTESTED', reason: 'no suspend control (only fixtures shown, which A10 does not touch)' });
    }
    // Listings moderation on an A10-created listing.
    const H = await signIn(browser, 'hotelA');
    const created = await L.apiProbe(H, 'POST', '/marketplace/listings', { title: `A10 QA listing ${STAMP}`, category: 'hotel_room', description: 'A10 QA listing for moderation testing', priceCents: 50000, currency: 'SAR', city: 'Makkah', pricingModel: 'PER_NIGHT' });
    ctx.listingId = created.data?.id;
    await p.goto(`${WEB}/admin-listings`); await L.settle(SA);
    t = Date.now();
    await p.getByLabel('Search').fill(STAMP);
    await waitReq(SA, /admin\/listings\?/, t, 8000); await L.settle(SA);
    const listed = (await body(p)).includes(STAMP);
    R.check(created.status < 300 && listed, { area: 'admin', route: '/admin-listings', role: 'superAdmin', action: 'a new listing appears in moderation', expected: 'listed for the moderator', actual: `create=${created.status} listedInAdmin=${listed}`, requests: [`POST /api/marketplace/listings ${created.status}`], screenshot: await L.shot(p, 'admin-listings') });
    if (ctx.listingId) {
      const approve = p.getByRole('button', { name: /^Approve/ }).first();
      if (await approve.isVisible().catch(() => false)) {
        t = Date.now();
        await approve.click(); await L.settle(SA);
        R.check(since(SA, t, /listings\/.*\/approve/).some((x) => x.status < 300), { area: 'admin', route: '/admin-listings', role: 'superAdmin', action: 'approve a listing', expected: 'PUT approve 2xx', actual: fmt(since(SA, t, /approve/)).join(', ') });
      }
      const remove = p.getByRole('button', { name: /^Remove listing/ }).first();
      t = Date.now();
      if (await remove.isVisible().catch(() => false)) {
        await remove.click();
        await confirmDialog(p, 'A10 QA: moderation removal of an A10 listing');
        await waitReq(SA, /DELETE \/api\/admin\/listings/, t, 8000); await L.settle(SA);
      }
      const gone = await L.apiProbe(H, 'GET', `/marketplace/listings/${ctx.listingId}`);
      R.check(since(SA, t, /DELETE \/api\/admin\/listings/).some((x) => x.status < 300) || gone.status === 404, { area: 'admin', route: '/admin-listings', role: 'superAdmin', action: 'remove a listing (A10’s own)', expected: 'DELETE 2xx; the listing is gone', actual: `${fmt(since(SA, t, /DELETE/)).join(', ') || 'control not offered'} GET listing=${gone.status}`, requests: fmt(since(SA, t, /DELETE/)) });
    }
    // Audit log: filter + pagination + export.
    await p.goto(`${WEB}/admin-logs`); await L.settle(SA);
    t = Date.now();
    await p.getByLabel('Action').fill('CREATE');
    await waitReq(SA, /audit-logs\?.*action=CREATE/i, t, 8000); await L.settle(SA);
    const logCalls = fmt(since(SA, t, /audit-logs/));
    const rowsAfter = (await body(p)).length;
    const next = p.getByRole('button', { name: 'Next' }).first();
    let pageCalls = [];
    if (await next.isEnabled().catch(() => false)) {
      const t2 = Date.now();
      await next.click(); await L.settle(SA);
      pageCalls = fmt(since(SA, t2, /audit-logs/));
    }
    R.check(logCalls.some((x) => / 200$/.test(x)) && rowsAfter > 200, { area: 'admin', route: '/admin-logs', role: 'superAdmin', action: 'filter the audit log by action and page through it', expected: 'filtered request 200 and rows shown', actual: `${logCalls.join(', ')} | next page: ${pageCalls.join(', ') || 'single page'}`, requests: [...logCalls, ...pageCalls].slice(0, 6), screenshot: await L.shot(p, 'admin-logs') });
    // Settings and support pages.
    for (const route of ['/admin-settings', '/admin-support', '/admin-roles', '/admin-dashboard']) {
      await p.goto(`${WEB}${route}`); await L.settle(SA);
      const st = await L.pageState(p);
      const w = L.windowStats(SA);
      R.check(st.state === 'rendered' && !st.errorAlerts.length && !w.failedApi.length, { area: 'admin', route, role: 'superAdmin', action: 'open the platform page', expected: 'renders with its data, no failed request', actual: `${st.state} ${JSON.stringify(st.h1)} failed=${JSON.stringify(w.failedApi)}`, requests: w.api.slice(0, 6) });
    }
    // Public inquiry → admin inquiries.
    const anon = await L.openIdentity(browser, 'anon-contact');
    await anon.page.goto(`${WEB}/contact`); await L.settle(anon);
    const f = await L.describe(anon.page, 'main');
    const fillIf = async (re, v) => { const el = anon.page.getByLabel(re).first(); if (await el.count().catch(() => 0)) { await el.fill(v).catch(() => {}); return true; } return false; };
    await fillIf(/name/i, `A10 QA ${STAMP}`);
    await fillIf(/email/i, `a10.contact.${STAMP}@qa.umrahconnect.test`);
    await fillIf(/phone/i, '+966500000099');
    await fillIf(/subject/i, `A10 QA inquiry ${STAMP}`);
    await fillIf(/message|how can we help|tell us/i, `A10 QA inquiry body ${STAMP}`);
    const selc = anon.page.locator('main select');
    for (let i = 0; i < await selc.count(); i++) { const o = await selc.nth(i).locator('option').evaluateAll((os) => os.map((x) => x.value).filter(Boolean)); if (o.length) await selc.nth(i).selectOption(o[0]).catch(() => {}); }
    t = Date.now();
    await anon.page.getByRole('button', { name: /Send|Submit/i }).first().click();
    await waitReq(anon, /POST \/api\/inquiries/, t, 10000); await L.settle(anon);
    const iq = since(anon, t, /inquiries/);
    await p.goto(`${WEB}/admin-inquiries`); await L.settle(SA);
    const inAdmin = (await body(p)).includes(STAMP);
    R.check(iq.some((x) => x.status < 300) && inAdmin, { area: 'admin', route: '/admin-inquiries', role: 'superAdmin', action: 'a website inquiry sent from /contact reaches the platform console', expected: 'POST /inquiries 2xx and the inquiry is listed', actual: `${fmt(iq).join(', ') || 'no request'} listedInAdmin=${inAdmin}`, requests: fmt(iq), extra: { contactForm: f }, screenshot: await L.shot(p, 'admin-inquiries') });
    const statusSel = p.locator('main select').first();
    if (await statusSel.count().catch(() => 0)) {
      const opts = await statusSel.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
      if (opts.length > 1) {
        t = Date.now();
        await statusSel.selectOption(opts[1]);
        await waitReq(SA, /PATCH \/api\/inquiries/, t, 8000); await L.settle(SA);
        R.check(since(SA, t, /inquiries/).some((x) => x.status < 300), { area: 'admin', route: '/admin-inquiries', role: 'superAdmin', action: 'change an inquiry status', expected: 'PATCH 2xx', actual: fmt(since(SA, t, /inquiries/)).join(', ') });
      }
    }
    await anon.ctx.close();
  });

  await browser.close();
  console.log(`TOTAL admin: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
