/* A10 — the sign-in workspace picker, built entirely from A10's own accounts:
 * own1 (now verified) founds an organization, then a fresh traveler account is registered with the
 * same email and password, so that one email opens two workspaces. No fixture account is touched. */
'use strict';
const L = require('./lib');
const R = new L.Recorder('picker');
const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (a) => a.map((n) => `${n.method} ${n.path} ${n.status}`);
(async () => {
  R.reset();
  const b = await L.launch();
  const own = L.ownAccounts().own1;
  const stamp = Date.now().toString(36);
  // 1. own1 founds an organization (it moves out of the traveler community).
  const O = await L.openIdentity(b, 'own1');
  const lr = await L.login(O);
  if (lr.outcome !== 'signed-in') throw new Error(`own1 sign-in failed: ${lr.error || lr.outcome}`);
  const me0 = await L.api(O, 'GET', '/auth/me');
  if (me0.data?.tenant?.slug === 'umrah-connect-travelers') {
    await O.page.goto(`${L.WEB}/onboarding`); await L.settle(O);
    const type = O.page.getByLabel('Organization type');
    const opts = await type.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    await type.selectOption(opts.find((o) => o === 'OPERATOR') || opts[0]);
    await O.page.getByLabel('Organization name').fill(`A10 QA Picker Org ${stamp}`);
    const c = O.page.getByLabel('Country of registration');
    const cs = await c.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    await c.selectOption(cs.find((x) => x === 'SA') || cs[0]);
    await O.page.getByRole('checkbox').first().check().catch(() => {});
    const t = Date.now();
    await O.page.getByRole('button', { name: 'Create organization' }).click();
    for (let i = 0; i < 60 && !since(O, t, /onboarding\/organization/).length; i++) await L.sleep(250);
    await L.settle(O);
  }
  const me1 = await L.api(O, 'GET', '/auth/me');
  R.check(me1.data?.tenant?.slug !== 'umrah-connect-travelers', { area: 'auth', route: '/onboarding', role: 'own1', action: 'a verified traveler founds an organization (second workspace for the same email)', expected: 'the account moves into the new organization', actual: `tenant=${me1.data?.tenant?.name} status=${me1.data?.tenant?.status} roles=${JSON.stringify(me1.data?.roles)}` });
  await O.ctx.close();
  // 2. Register a fresh traveler with the same email and password.
  const N = await L.openIdentity(b, 'picker-signup');
  await N.page.goto(`${L.WEB}/signup`); await L.settle(N);
  await N.page.getByRole('button', { name: 'Traveler / Pilgrim' }).click();
  await N.page.locator('#signup-firstName').fill('Ayesha');
  await N.page.locator('#signup-lastName').fill('Tester');
  await N.page.locator('#signup-email').fill(own.email);
  await N.page.locator('#signup-password').fill(own.password);
  let t = Date.now();
  await N.page.locator('main button[type=submit]').first().click();
  for (let i = 0; i < 60 && new URL(N.page.url()).pathname === '/signup'; i++) await L.sleep(250);
  await L.settle(N);
  const reg = fmt(since(N, t, /auth\/register/));
  R.check(reg.some((x) => / 201$/.test(x)), { area: 'auth', route: '/signup', role: 'own1', action: 'register a traveler account with an email that already exists in another organization', expected: 'allowed (registration uniqueness is per organization)', actual: reg.join(', ') || 'no request' });
  await N.ctx.close();
  // 3. Sign in: the workspace picker must appear and must open the chosen workspace.
  const P = await L.openIdentity(b, 'picker');
  await L.paceLogin('own1');
  await P.page.goto(`${L.WEB}/login`);
  await P.page.locator('#signin-email').fill(own.email);
  await P.page.locator('#signin-password').fill(own.password);
  t = Date.now();
  await P.page.locator('form button[type=submit]').click();
  const out = await L.waitLoginOutcome(P.page, 20000);
  R.check(out.outcome === 'workspace-picker' && (out.workspaces || []).length >= 2, { area: 'auth', route: '/login', role: 'own1', action: 'sign in with an email that opens more than one workspace', expected: 'a workspace picker listing both organizations, not an error', actual: `${out.outcome}: ${JSON.stringify(out.workspaces || out.error)}`, requests: fmt(since(P, t, /auth\/login/)), screenshot: await L.shot(P.page, 'auth-workspace-picker') });
  if (out.outcome === 'workspace-picker') {
    const sel = P.page.locator('#signin-workspace');
    const options = await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent.trim() })).filter((o) => o.v));
    const community = options.find((o) => /Travelers/i.test(o.t)) || options[0];
    await sel.selectOption(community.v);
    t = Date.now();
    await P.page.locator('form button[type=submit]').click();
    const out2 = await L.waitLoginOutcome(P.page, 20000);
    await L.settle(P);
    const me = await L.api(P, 'GET', '/auth/me');
    R.check(out2.outcome === 'signed-in' && me.data?.tenant?.name === community.t, { area: 'auth', route: '/login', role: 'own1', action: `choose the "${community.t}" workspace in the picker`, expected: 'signs in to exactly that workspace', actual: `${out2.outcome} path=${out2.path} tenant=${me.data?.tenant?.name} (${me.data?.tenant?.slug})`, requests: fmt(since(P, t, /auth\/login/)), screenshot: await L.shot(P.page, 'auth-workspace-picked') });
    // And the other workspace.
    const other = options.find((o) => o.v !== community.v);
    if (other) {
      const Q = await L.openIdentity(b, 'picker2');
      await L.paceLogin('own1');
      await Q.page.goto(`${L.WEB}/login`);
      await Q.page.locator('#signin-email').fill(own.email);
      await Q.page.locator('#signin-password').fill(own.password);
      await Q.page.locator('form button[type=submit]').click();
      await L.waitLoginOutcome(Q.page, 20000);
      await Q.page.locator('#signin-workspace').selectOption(other.v);
      await Q.page.locator('form button[type=submit]').click();
      const out3 = await L.waitLoginOutcome(Q.page, 20000);
      await L.settle(Q);
      const me2 = await L.api(Q, 'GET', '/auth/me');
      R.check(out3.outcome === 'signed-in' && me2.data?.tenant?.name === other.t, { area: 'auth', route: '/login', role: 'own1', action: `choose the "${other.t}" workspace in the picker`, expected: 'signs in to the other workspace with that organization’s scope', actual: `${out3.outcome} path=${out3.path} tenant=${me2.data?.tenant?.name} status=${me2.data?.tenant?.status}`, screenshot: await L.shot(Q.page, 'auth-workspace-picked-2') });
      await Q.ctx.close();
    }
  }
  await b.close();
  console.log(`TOTAL picker: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
