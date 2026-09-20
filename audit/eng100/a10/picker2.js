/* A10 — choosing a workspace in the sign-in picker (supersedes picker-0004 and picker-0005). */
'use strict';
const L = require('./lib');
const R = new L.Recorder('picker2');
async function pick(b, own, wanted) {
  const id = await L.openIdentity(b, 'pickerX');
  await L.paceLogin('own1');
  await id.page.goto(`${L.WEB}/login`);
  const submit = id.page.locator('form button[type=submit]');
  await id.page.locator('#signin-email').fill(own.email);
  await id.page.locator('#signin-password').fill(own.password);
  for (let i = 0; i < 40 && await submit.isDisabled().catch(() => true); i++) await L.sleep(250);
  await submit.click();
  await id.page.locator('#signin-workspace').waitFor({ timeout: 20000 });
  const opts = await id.page.locator('#signin-workspace option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent.trim() })).filter((o) => o.v));
  const choice = opts.find((o) => wanted.test(o.t));
  await id.page.locator('#signin-workspace').selectOption(choice.v);
  const t0 = Date.now();
  for (let i = 0; i < 40 && await submit.isDisabled().catch(() => true); i++) await L.sleep(250);
  await submit.click();
  for (let i = 0; i < 80 && new URL(id.page.url()).pathname === '/login'; i++) await L.sleep(250);
  await L.settle(id);
  const me = await L.api(id, 'GET', '/auth/me');
  const logins = id.net.filter((n) => n.t >= t0 && /auth\/login/.test(n.path)).map((n) => `${n.method} ${n.path} ${n.status}`);
  const alert = (await id.page.locator('main [role=alert]').allInnerTexts().catch(() => [])).join(' ').replace(/\s+/g, ' ').slice(0, 160);
  return { id, choice, path: new URL(id.page.url()).pathname, tenant: me.data?.tenant, nav: (await L.inventory(id.page)).nav, logins, alert };
}
(async () => {
  R.reset();
  const b = await L.launch();
  const own = L.ownAccounts().own1;
  const a = await pick(b, own, /Travelers/i);
  R.check(a.path !== '/login' && a.tenant?.slug === 'umrah-connect-travelers', { area: 'auth', route: '/login', role: 'own1', action: `choose the traveler community workspace in the picker (supersedes picker-0004)`, expected: 'signs in to that workspace and lands in its menu', actual: `path=${a.path} tenant=${a.tenant?.name} login=${a.logins.join(',')} alert="${a.alert}" menu=${JSON.stringify(a.nav).slice(0, 110)}`, screenshot: await L.shot(a.id.page, 'auth-workspace-picked-community') });
  await a.id.ctx.close();
  const o = await pick(b, own, /Picker Org/i);
  R.check(o.path !== '/login' && /a10-qa-picker-org/.test(String(o.tenant?.slug)), { area: 'auth', route: '/login', role: 'own1', action: 'choose the organization workspace in the picker (supersedes picker-0005)', expected: 'signs in to the organization (pending verification, so the verification page opens)', actual: `path=${o.path} tenant=${o.tenant?.name} status=${o.tenant?.status} login=${o.logins.join(',')} alert="${o.alert}" menu=${JSON.stringify(o.nav)}`, screenshot: await L.shot(o.id.page, 'auth-workspace-picked-org') });
  await o.id.ctx.close();
  await b.close();
  console.log(`TOTAL picker2: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
