/* A10 — re-verification of auth checks whose first-run expectation or timing was wrong in the harness
 * (not in the product). Each re-check supersedes the named first-run row. */
'use strict';
const L = require('./lib');
const R = new L.Recorder('auth-amend2');
const WEB = L.WEB;
const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (arr) => arr.map((n) => `${n.method} ${n.path} ${n.status}`);
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
async function waitFor(id, re, t0, ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { if (since(id, t0, re).length) return true; await L.sleep(150); } return false; }

(async () => {
  R.reset();
  const browser = await L.launch();
  // 4. Wrong current password, waiting for the server answer (supersedes auth-0036).
  {
    const o1 = await L.openIdentity(browser, 'own1');
    const lr1 = await L.login(o1);
    if (lr1.outcome !== 'signed-in') throw new Error('own1 sign-in failed: ' + JSON.stringify(lr1));
    await o1.page.goto(`${WEB}/settings`); await L.settle(o1);
    await o1.page.locator('#current-password').fill('Wrong-current-1');
    await o1.page.locator('#new-password').fill('Another1Pass');
    await o1.page.locator('#confirm-password').fill('Another1Pass');
    const t = Date.now();
    await o1.page.getByRole('button', { name: 'Change password' }).click();
    await waitFor(o1, /change-password/, t); await L.settle(o1);
    const form = await o1.page.locator('form[aria-labelledby=change-password-title]').innerText().catch(() => '');
    const req = fmt(since(o1, t, /change-password/));
    const path = new URL(o1.page.url()).pathname;
    R.check(/current password is not correct/i.test(form) && req.some((r) => / 4\d\d$/.test(r)) && path === '/settings', { area: 'settings', route: '/settings', role: 'own1', kind: 'invalid', action: 'change password with a wrong current password (supersedes auth-0036)', expected: 'server 4xx; "Your current password is not correct."; still signed in', actual: `${form.replace(/\s+/g, ' ').match(/Your current password[^.]*\./)?.[0] || form.replace(/\s+/g, ' ').slice(0, 200)} | ${req.join(',')} | path=${path}`, requests: req, screenshot: await L.shot(o1.page, 'auth-amend-wrong-current-password') });
    const me = await L.api(o1, 'GET', '/auth/me');
    R.check(me.status === 200, { area: 'settings', route: '/settings', role: 'own1', kind: 'persist', action: 'session kept after a rejected password change', expected: 'GET /auth/me 200', actual: String(me.status) });
    await o1.ctx.close();
  }
  await browser.close();
  console.log(`TOTAL auth-amend2: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
