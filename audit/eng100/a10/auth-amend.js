/* A10 — re-verification of auth checks whose first-run expectation or timing was wrong in the harness
 * (not in the product). Each re-check supersedes the named first-run row. */
'use strict';
const L = require('./lib');
const R = new L.Recorder('auth-amend');
const WEB = L.WEB;
const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (arr) => arr.map((n) => `${n.method} ${n.path} ${n.status}`);
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
async function waitFor(id, re, t0, ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { if (since(id, t0, re).length) return true; await L.sleep(150); } return false; }

(async () => {
  R.reset();
  const browser = await L.launch();
  const own = L.ownAccounts();
  const stamp = Date.now().toString(36);

  // 1. Forgot password: same neutral answer for an unknown and a registered email (supersedes auth-0007, auth-0023).
  {
    const a = await L.openIdentity(browser, 'anon-amend');
    const msgs = {};
    for (const [label, email] of [['unknown', `nobody2.${stamp}@qa.umrahconnect.test`], ['registered', own.own2.email]]) {
      await a.page.goto(`${WEB}/login`); await L.settle(a);
      await a.page.locator('#signin-email').fill(email);
      const t = Date.now();
      await a.page.getByRole('button', { name: 'Forgot password?' }).click();
      await waitFor(a, /forgot-password/, t); await L.settle(a);
      const b = await bodyText(a.page);
      msgs[label] = { text: (b.match(/Password reset requested[^.]*\.[^.]*\./) || b.match(/If an account exists[^.]*\./) || [''])[0], req: fmt(since(a, t, /forgot-password/)) };
    }
    const neutral = /If an account exists for that email, a reset link has been sent/;
    R.check(neutral.test(msgs.unknown.text) && msgs.unknown.req.some((r) => / 200$/.test(r)), { area: 'auth', route: '/login', role: 'anonymous', kind: 'invalid', action: 'Forgot password? for an unknown email (supersedes auth-0007)', expected: 'neutral "If an account exists…" message, 200', actual: `${msgs.unknown.text} | ${msgs.unknown.req.join(',')}`, requests: msgs.unknown.req, screenshot: await L.shot(a.page, 'auth-amend-forgot-registered') });
    R.check(msgs.registered.text === msgs.unknown.text && msgs.registered.req.some((r) => / 200$/.test(r)), { area: 'auth', route: '/login', role: 'anonymous', action: 'Forgot password? for a registered email gives the identical answer (supersedes auth-0023)', expected: 'identical message and status (no account enumeration)', actual: `registered="${msgs.registered.text}" (${msgs.registered.req.join(',')}) unknown="${msgs.unknown.text}"`, requests: msgs.registered.req });

    // 2. Reset with an invalid token (supersedes auth-0009) — the page has no <main>, read the body.
    await a.page.goto(`${WEB}/reset-password?token=not-a-real-token-${stamp}`); await L.settle(a);
    const ins = a.page.locator('input[type=password]');
    for (let i = 0; i < await ins.count(); i++) await ins.nth(i).fill('BrandNewPass9');
    const t = Date.now();
    await a.page.locator('form button[type=submit]').click();
    await waitFor(a, /reset-password/, t); await L.settle(a);
    const b = await bodyText(a.page);
    const hasMain = await a.page.locator('main').count();
    R.check(/This link is not valid/.test(b) && !/Password saved/.test(b), { area: 'auth', route: '/reset-password', role: 'anonymous', kind: 'invalid', action: 'reset with an invalid token (supersedes auth-0009)', expected: '"This link is not valid" with a way back; password unchanged', actual: `${(b.match(/This link is not valid[^.]*\.[^.]*\./) || [b.slice(0, 160)])[0]} | ${fmt(since(a, t, /reset-password/)).join(',')}`, requests: fmt(since(a, t, /reset-password/)) });
    R.check(hasMain > 0, { area: 'a11y', route: '/reset-password', role: 'anonymous', action: 'page exposes a <main> landmark', expected: 'one <main> landmark (as /login, /signup, /verify-email have)', actual: `main landmarks=${hasMain}` });

    // 5. Onboarding API refuses an unverified traveler with a valid body (supersedes auth-0052).
    await a.ctx.close();
  }
  {
    const o2 = await L.openIdentity(browser, 'own2');
    const lr = await L.login(o2);
    const ob = await L.apiProbe(o2, 'POST', '/onboarding/organization', { name: `A10 Probe Org ${stamp}`, type: 'VENDOR_HOTEL', country: 'SA' });
    R.check(lr.outcome === 'signed-in' && ob.status === 403 && /Confirm your email/i.test(ob.message || ''), { area: 'api-refusal', route: '/onboarding', role: 'own2', kind: 'denied', action: 'API POST /onboarding/organization (valid body) while email unverified (supersedes auth-0052)', expected: '403 "Confirm your email address before registering an organization"', actual: `${ob.status} ${ob.message}`, requests: [`POST /api/onboarding/organization ${ob.status}`] });
    // 3. Resend verification after the 60 s cooldown (supersedes auth-0020): the registration email was sent long ago now.
    await o2.page.goto(`${WEB}/verify-email`); await L.settle(o2);
    const resend = o2.page.locator('main button').filter({ hasText: /send|new link|resend/i }).first();
    const t = Date.now();
    await resend.click();
    await waitFor(o2, /verify-email\/request/, t); await L.settle(o2);
    const b = await bodyText(o2.page);
    const req = fmt(since(o2, t, /verify-email\/request/));
    R.check(req.some((r) => / 20\d$/.test(r)) && /Verification email sent/.test(b), { area: 'auth', route: '/verify-email', role: 'own2', action: 'request a new verification email after the cooldown (supersedes auth-0020)', expected: 'POST 2xx and "Verification email sent"', actual: `${(b.match(/Verification email sent[^.]*\./) || b.match(/Please wait[^.]*\./) || [b.slice(0, 120)])[0]} | ${req.join(',')}`, requests: req, screenshot: await L.shot(o2.page, 'auth-amend-verification-sent') });
    // Immediately again: the cooldown answer (429) is shown cleanly.
    const again = o2.page.locator('main button').filter({ hasText: /send|new link|resend/i }).first();
    if (await again.isVisible().catch(() => false)) {
      const t2 = Date.now();
      await again.click();
      await waitFor(o2, /verify-email\/request/, t2); await L.settle(o2);
      const b2 = await bodyText(o2.page);
      const req2 = fmt(since(o2, t2, /verify-email\/request/));
      R.check(req2.some((r) => / 429$/.test(r)) && /Please wait a moment/.test(b2), { area: 'auth', route: '/verify-email', role: 'own2', kind: 'double-submit', action: 'request another verification email within 60 s', expected: '429 cooldown shown as "Please wait a moment"', actual: `${(b2.match(/Please wait a moment[^.]*\./) || [''])[0]} | ${req2.join(',')}`, requests: req2 });
    } else R.rec({ area: 'auth', route: '/verify-email', role: 'own2', kind: 'double-submit', action: 'request another verification email within 60 s', expected: 'cooldown message', actual: 'resend button hidden after a successful send', result: 'PASS', reason: 'button not offered again' });
    await o2.ctx.close();
  }
  // 4. Wrong current password, waiting for the server answer (supersedes auth-0036).
  {
    const o1 = await L.openIdentity(browser, 'own1');
    await L.login(o1);
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
  console.log(`TOTAL auth-amend: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
