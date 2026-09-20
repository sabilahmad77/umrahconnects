/* A10 — authentication, registration, verification, reset, settings journeys.
 * Destructive auth actions (wrong passwords, password change, sign out everywhere) use accounts this
 * script registers itself, never the shared fixtures.
 */
'use strict';
const crypto = require('crypto');
const L = require('./lib');
const R = new L.Recorder('auth');
const WEB = L.WEB;

const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (arr) => arr.map((n) => `${n.method} ${n.path} ${n.status}`);
const txt = (page, sel = 'main') => page.locator(sel).first().innerText().then((s) => s.replace(/\s+/g, ' ')).catch(() => '');
function newPassword() { return `Qa${crypto.randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x')}7`; }
async function visible(page, text) { return page.getByText(text, { exact: false }).first().isVisible().catch(() => false); }

(async () => {
  R.reset();
  const browser = await L.launch();
  const stamp = Date.now().toString(36);
  let unknownMsg = '';

  // ── Google sign-in availability ───────────────────────────────────────────
  {
    const anon = await L.openIdentity(browser, 'anon-google');
    await anon.page.goto(`${WEB}/login`); await L.settle(anon);
    const g = await L.api(anon, 'GET', '/auth/google/status');
    const btn = await anon.page.getByRole('link', { name: /google/i }).or(anon.page.getByRole('button', { name: /google/i })).first().isVisible().catch(() => false);
    const enabled = !!g.data?.enabled;
    if (!enabled && !btn) R.rec({ area: 'auth', route: '/login', role: 'anonymous', action: 'Google sign-in button', expected: 'hidden when provider not configured', actual: `button hidden; GET /api/auth/google/status ${g.status} enabled=${enabled} mode=${g.data?.mode ?? '-'}`, requests: [`GET /api/auth/google/status ${g.status}`], result: 'UNTESTED', reason: 'provider: Google sign-in is not configured in this environment (button correctly hidden)' });
    else R.check(enabled === btn, { area: 'auth', route: '/login', role: 'anonymous', action: 'Google sign-in button matches provider status', expected: 'button shown iff enabled', actual: `enabled=${enabled} mode=${g.data?.mode} button=${btn}`, requests: [`GET /api/auth/google/status ${g.status}`] });
    // Signed-out direct navigation to a workspace route.
    const t0 = Date.now();
    await anon.page.goto(`${WEB}/pilgrims`); await L.settle(anon);
    const u = new URL(anon.page.url());
    R.check(u.pathname === '/login', { area: 'auth', route: '/pilgrims', role: 'anonymous', kind: 'denied', action: 'signed-out direct URL to a workspace page', expected: 'sent to /login (returnTo kept)', actual: `${u.pathname}${u.search}`, requests: fmt(since(anon, t0, /\/api\//)).slice(0, 6), screenshot: await L.shot(anon.page, 'auth-anon-pilgrims-redirect') });
    const p = await L.api(anon, 'GET', '/pilgrims');
    R.check(p.status === 401, { area: 'api-refusal', route: '/pilgrims', role: 'anonymous', kind: 'denied', action: 'API GET /pilgrims without a session', expected: '401', actual: `${p.status} ${p.code}`, requests: [`GET /api/pilgrims ${p.status}`] });

    // Login form validation: empty submit sends nothing.
    await anon.page.goto(`${WEB}/login`); await L.settle(anon);
    const t1 = Date.now();
    await anon.page.locator('form button[type=submit]').click();
    await L.sleep(800);
    const sent = since(anon, t1, /POST \/api\/auth\/login/);
    R.check(sent.length === 0 && new URL(anon.page.url()).pathname === '/login', { area: 'auth', route: '/login', role: 'anonymous', kind: 'invalid', action: 'submit empty sign-in form', expected: 'blocked client-side (required fields), no request', actual: `requests=${sent.length} path=${new URL(anon.page.url()).pathname}` });
    // Unknown email: generic error.
    await anon.page.locator('#signin-email').fill(`nobody.${stamp}@qa.umrahconnect.test`);
    await anon.page.locator('#signin-password').fill('WrongPass123');
    const t2 = Date.now();
    await anon.page.locator('form button[type=submit]').click();
    const o = await L.waitLoginOutcome(anon.page, 15000);
    unknownMsg = o.error || '';
    R.check(o.outcome === 'error' && /invalid|incorrect|not match|check/i.test(unknownMsg), { area: 'auth', route: '/login', role: 'anonymous', kind: 'invalid', action: 'sign in with an unknown email', expected: 'generic invalid-credentials error, stays on /login', actual: `${o.outcome}: ${unknownMsg}`, requests: fmt(since(anon, t2, /auth\/login/)), screenshot: await L.shot(anon.page, 'auth-login-unknown-email') });
    // Forgot password without an email.
    await anon.page.locator('#signin-email').fill('');
    const t3 = Date.now();
    await anon.page.getByRole('button', { name: 'Forgot password?' }).click();
    await L.sleep(600);
    R.check(await visible(anon.page, 'Enter your account email address first.') && since(anon, t3, /forgot-password/).length === 0, { area: 'auth', route: '/login', role: 'anonymous', kind: 'invalid', action: 'Forgot password? with no email', expected: '"Enter your account email address first." and no request', actual: `msg=${await visible(anon.page, 'Enter your account email address first.')} requests=${since(anon, t3, /forgot-password/).length}` });
    // Forgot password for an unknown email: neutral answer.
    await anon.page.locator('#signin-email').fill(`nobody.${stamp}@qa.umrahconnect.test`);
    const t4 = Date.now();
    await anon.page.getByRole('button', { name: 'Forgot password?' }).click();
    await L.settle(anon);
    const fpUnknown = await txt(anon.page, 'form');
    const fpReq = fmt(since(anon, t4, /forgot-password/));
    R.check(/If this email is registered|check your inbox/i.test(fpUnknown) && fpReq.some((r) => / 20\d$/.test(r)), { area: 'auth', route: '/login', role: 'anonymous', kind: 'invalid', action: 'Forgot password? for an unknown email', expected: 'neutral "if this email is registered" message (no account enumeration)', actual: `${fpUnknown.match(/If this email[^.]*\.|[^.]*inbox[^.]*\./)?.[0] || fpUnknown.slice(0, 160)}`, requests: fpReq });
    // Reset page without / with a bad token.
    await anon.page.goto(`${WEB}/reset-password`); await L.settle(anon);
    R.check(await visible(anon.page, 'Reset link required'), { area: 'auth', route: '/reset-password', role: 'anonymous', kind: 'invalid', action: 'open reset page without a token', expected: '"Reset link required"', actual: (await txt(anon.page)).slice(0, 160) });
    await anon.page.goto(`${WEB}/reset-password?token=not-a-real-token-${stamp}`); await L.settle(anon);
    const pwInputs = anon.page.locator('input[type=password]');
    const nIn = await pwInputs.count();
    let resetBad = 'no form';
    if (nIn) {
      for (let i = 0; i < nIn; i++) await pwInputs.nth(i).fill('BrandNewPass9');
      const t5 = Date.now();
      await anon.page.locator('form button[type=submit]').click();
      await L.settle(anon);
      resetBad = `${(await txt(anon.page)).slice(0, 200)} | ${fmt(since(anon, t5, /reset-password/)).join(',')}`;
    } else resetBad = (await txt(anon.page)).slice(0, 200);
    R.check(/invalid|expired|no longer|not updated|used/i.test(resetBad) && !/Password saved|updated successfully/i.test(resetBad), { area: 'auth', route: '/reset-password', role: 'anonymous', kind: 'invalid', action: 'reset with an invalid token', expected: 'clear invalid/expired-link error, password not changed', actual: resetBad, screenshot: await L.shot(anon.page, 'auth-reset-bad-token') });
    // Verify page without / with a bad token.
    await anon.page.goto(`${WEB}/verify-email`); await L.settle(anon);
    R.check(await visible(anon.page, 'Verification link required'), { area: 'auth', route: '/verify-email', role: 'anonymous', kind: 'invalid', action: 'open verify page without a token', expected: '"Verification link required"', actual: (await txt(anon.page)).slice(0, 160) });
    await anon.page.goto(`${WEB}/verify-email?token=not-a-real-token-${stamp}`); await L.settle(anon);
    const confirmBtn = anon.page.locator('main button').filter({ hasText: /confirm|verify/i }).first();
    let vbad = 'no confirm button';
    if (await confirmBtn.isVisible().catch(() => false)) {
      const t6 = Date.now();
      await confirmBtn.click(); await L.settle(anon);
      vbad = `${(await txt(anon.page)).slice(0, 220)} | ${fmt(since(anon, t6, /verify-email/)).join(',')}`;
    }
    R.check(/invalid|expired|not valid|no longer|request a new|new link/i.test(vbad), { area: 'auth', route: '/verify-email', role: 'anonymous', kind: 'invalid', action: 'confirm with an invalid verification token', expected: 'clear invalid-link result with a way to get a new link', actual: vbad, screenshot: await L.shot(anon.page, 'auth-verify-bad-token') });
    await anon.ctx.close();
  }

  // ── Registration ──────────────────────────────────────────────────────────
  const email1 = `a10.traveler.${stamp}@qa.umrahconnect.test`;
  const pw1 = newPassword();
  let o1;
  {
    o1 = await L.openIdentity(browser, 'own1');
    const page = o1.page;
    await page.goto(`${WEB}/signup`); await L.settle(o1);
    const roleBtns = await page.locator('main button[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    R.check(roleBtns.includes('Traveler / Pilgrim'), { area: 'auth', route: '/signup', role: 'anonymous', action: 'signup step 1 lists account types', expected: 'Traveler / Pilgrim and provider types', actual: roleBtns.join(' | ') });
    await page.getByRole('button', { name: 'Traveler / Pilgrim' }).click();
    await page.locator('#signup-email').waitFor();
    // Required-field path.
    let t = Date.now();
    await page.locator('main form button[type=submit], main button[type=submit]').first().click();
    await L.sleep(700);
    const errs = await page.locator('[id^=signup-][id$=-error]').allInnerTexts();
    R.check(errs.length >= 3 && since(o1, t, /auth\/register/).length === 0, { area: 'auth', route: '/signup', role: 'anonymous', kind: 'invalid', action: 'submit empty registration form', expected: 'inline errors for first name, email, password; no request', actual: `errors=${JSON.stringify(errs)} requests=${since(o1, t, /auth\/register/).length}`, screenshot: await L.shot(page, 'auth-signup-empty') });
    // Invalid email + weak password.
    await page.locator('#signup-firstName').fill('Ayesha');
    await page.locator('#signup-lastName').fill('Tester');
    await page.locator('#signup-email').fill('not-an-email');
    await page.locator('#signup-password').fill('abc');
    t = Date.now();
    await page.locator('main button[type=submit]').first().click();
    await L.sleep(700);
    const errs2 = await page.locator('[id^=signup-][id$=-error]').allInnerTexts();
    R.check(errs2.some((e) => /valid email/i.test(e)) && errs2.some((e) => /8/.test(e)) && since(o1, t, /auth\/register/).length === 0, { area: 'auth', route: '/signup', role: 'anonymous', kind: 'invalid', action: 'register with invalid email and weak password', expected: 'email and password-policy errors; no request', actual: `errors=${JSON.stringify(errs2)}` });
    // Positive + double-submit.
    await page.locator('#signup-email').fill(email1);
    await page.locator('#signup-password').fill(pw1);
    L.saveOwnAccount('own1', email1, pw1, { role: 'PILGRIM', created: L.now() });
    t = Date.now();
    await page.locator('main button[type=submit]').first().dblclick();
    for (let i = 0; i < 60 && new URL(page.url()).pathname === '/signup'; i++) await L.sleep(250);
    await L.settle(o1);
    const regReqs = since(o1, t, /POST \/api\/auth\/register/);
    const path1 = new URL(page.url()).pathname;
    R.check(regReqs.length === 1, { area: 'auth', route: '/signup', role: 'anonymous', kind: 'double-submit', action: 'double-click "Create account"', expected: 'exactly one POST /auth/register', actual: `${regReqs.length} request(s): ${fmt(regReqs).join(', ')}`, requests: fmt(regReqs) });
    R.check(regReqs.some((r) => r.status === 201 || r.status === 200) && path1 === '/travel-plan', { area: 'auth', route: '/signup', role: 'anonymous', action: 'register a traveler account', expected: 'account created, signed in, lands on /travel-plan', actual: `path=${path1} statuses=${regReqs.map((r) => r.status).join(',')}`, requests: fmt(regReqs), screenshot: await L.shot(page, 'auth-signup-success') });
    const banner = await visible(page, 'Confirm your email address');
    R.check(banner && o1.me && o1.me.emailVerified === false, { area: 'auth', route: '/travel-plan', role: 'own1', action: 'new account shows confirm-email banner', expected: 'banner "Confirm your email address"; /auth/me emailVerified=false', actual: `banner=${banner} emailVerified=${o1.me?.emailVerified}` });
    R.check(JSON.stringify(o1.me?.permissions?.slice().sort()) === JSON.stringify(['marketplace:listing:read', 'social:post:create', 'social:post:read']), { area: 'auth', route: '/signup', role: 'own1', action: 'self-registered traveler gets only traveler capabilities', expected: 'marketplace:listing:read, social:post:create, social:post:read', actual: (o1.me?.permissions || []).join(', ') });
    // Persistence after refresh.
    await page.reload(); await L.settle(o1);
    R.check(new URL(page.url()).pathname === '/travel-plan', { area: 'auth', route: '/travel-plan', role: 'own1', kind: 'persist', action: 'session survives a page refresh', expected: 'still signed in on /travel-plan', actual: new URL(page.url()).pathname });
    // Resend verification email from the verify page (signed in).
    await page.goto(`${WEB}/verify-email`); await L.settle(o1);
    const resend = page.locator('main button').filter({ hasText: /send|new link|resend/i }).first();
    if (await resend.isVisible().catch(() => false)) {
      t = Date.now();
      await resend.click(); await L.settle(o1);
      const vr = fmt(since(o1, t, /verify-email\/request/));
      const body = await txt(page);
      R.check(vr.some((r) => / 20\d$/.test(r)) && /Verification email sent|Please wait/i.test(body), { area: 'auth', route: '/verify-email', role: 'own1', action: 'request a new verification email', expected: 'POST /auth/verify-email/request 2xx and "Verification email sent"', actual: `${body.match(/Verification email sent[^.]*\.|Please wait[^.]*\.|Email not sent[^.]*\./)?.[0] || body.slice(0, 150)}`, requests: vr });
      // Double-submit on resend: the button must not fire twice.
      t = Date.now();
      const again = page.locator('main button').filter({ hasText: /send|new link|resend/i }).first();
      if (await again.isVisible().catch(() => false)) { await again.dblclick().catch(() => {}); await L.settle(o1); }
      const vr2 = since(o1, t, /verify-email\/request/);
      R.check(vr2.length <= 1 || vr2.filter((r) => r.status === 429 || r.status === 200 || r.status === 201).length === vr2.length, { area: 'auth', route: '/verify-email', role: 'own1', kind: 'double-submit', action: 'double-click resend verification', expected: 'at most one request, or server cooldown answered cleanly', actual: fmt(vr2).join(', ') || 'no request (button hidden after send)', requests: fmt(vr2) });
    } else R.rec({ area: 'auth', route: '/verify-email', role: 'own1', action: 'request a new verification email', expected: 'resend button', actual: (await txt(page)).slice(0, 200), result: 'FAIL' });
    R.rec({ area: 'auth', route: '/verify-email', role: 'own1', action: 'confirm email with the real link from the email', expected: 'email confirmed', actual: 'MAIL_DRIVER=log writes the link to the API process log, which this tester cannot read', result: 'UNTESTED', reason: 'mail: verification link only available in the API server log (not accessible to A10)' });
    // Forgot password for a registered email: same neutral answer.
    const anon2 = await L.openIdentity(browser, 'anon-fp');
    await anon2.page.goto(`${WEB}/login`); await L.settle(anon2);
    await anon2.page.locator('#signin-email').fill(email1);
    t = Date.now();
    await anon2.page.getByRole('button', { name: 'Forgot password?' }).click(); await L.settle(anon2);
    const fpKnown = await txt(anon2.page, 'form');
    R.check(/If this email is registered|check your inbox/i.test(fpKnown), { area: 'auth', route: '/login', role: 'anonymous', action: 'Forgot password? for a registered email', expected: 'same neutral message as for an unknown email', actual: fpKnown.match(/If this email[^.]*\.|[^.]*inbox[^.]*\./)?.[0] || fpKnown.slice(0, 160), requests: fmt(since(anon2, t, /forgot-password/)) });
    R.rec({ area: 'auth', route: '/reset-password', role: 'own1', action: 'reset password with the real link from the email', expected: 'password replaced, sign in with new password', actual: 'reset link is only written to the API process log (MAIL_DRIVER=log)', result: 'UNTESTED', reason: 'mail: reset link only available in the API server log (not accessible to A10)' });
    // Duplicate registration.
    await anon2.page.goto(`${WEB}/signup`); await L.settle(anon2);
    await anon2.page.getByRole('button', { name: 'Traveler / Pilgrim' }).click();
    await anon2.page.locator('#signup-firstName').fill('Dup');
    await anon2.page.locator('#signup-email').fill(email1.toUpperCase());
    await anon2.page.locator('#signup-password').fill(newPassword());
    t = Date.now();
    await anon2.page.locator('main button[type=submit]').first().click();
    await L.settle(anon2);
    const dup = since(anon2, t, /auth\/register/);
    const dupTxt = await txt(anon2.page);
    R.check(dup.some((r) => r.status === 409) && new URL(anon2.page.url()).pathname === '/signup' && /already|exists|registered/i.test(dupTxt), { area: 'auth', route: '/signup', role: 'anonymous', kind: 'invalid', action: 'register an email that already has a traveler account (different case)', expected: '409 and a clear "already exists" message; stays on /signup', actual: `${fmt(dup).join(',')} path=${new URL(anon2.page.url()).pathname} msg=${(dupTxt.match(/[^.]*already[^.]*\./i) || [''])[0]}`, requests: fmt(dup), screenshot: await L.shot(anon2.page, 'auth-signup-duplicate') });
    // Wrong password on our own account (not a fixture).
    await anon2.page.goto(`${WEB}/login`); await L.settle(anon2);
    await anon2.page.locator('#signin-email').fill(email1);
    await anon2.page.locator('#signin-password').fill('Definitely-wrong-9');
    t = Date.now();
    await anon2.page.locator('form button[type=submit]').click();
    const wo = await L.waitLoginOutcome(anon2.page, 15000);
    R.check(wo.outcome === 'error', { area: 'auth', route: '/login', role: 'own1', kind: 'invalid', action: 'sign in with a wrong password', expected: 'generic error, not signed in', actual: `${wo.outcome}: ${wo.error}`, requests: fmt(since(anon2, t, /auth\/login/)) });
    R.check(!!wo.error && wo.error === unknownMsg, { area: 'auth', route: '/login', role: 'own1', kind: 'invalid', action: 'wrong-password message equals unknown-email message (no account enumeration)', expected: 'identical messages', actual: `wrong-password="${wo.error}" unknown-email="${unknownMsg}"` });
    await anon2.ctx.close();
  }

  // ── Settings: preferences (own account) ──────────────────────────────────
  {
    const page = o1.page;
    await page.goto(`${WEB}/settings`); await L.settle(o1);
    const locale = page.locator('#pref-locale');
    const tz = page.locator('#pref-timezone');
    const saveBtn = page.getByRole('button', { name: 'Save preferences' });
    const disabledBefore = await saveBtn.isDisabled().catch(() => null);
    R.check(disabledBefore === true, { area: 'settings', route: '/settings', role: 'own1', kind: 'invalid', action: 'Save preferences with no changes', expected: 'button disabled', actual: `disabled=${disabledBefore}` });
    const locales = await locale.locator('option').evaluateAll((os) => os.map((o) => o.value));
    const curLocale = await locale.inputValue();
    const newLocale = locales.find((l) => l && l !== curLocale) || curLocale;
    const tzs = await tz.locator('option').evaluateAll((os) => os.map((o) => o.value));
    const curTz = await tz.inputValue();
    const newTz = tzs.find((z) => z && z !== curTz && /Riyadh|Karachi|London|Dubai|Jakarta/.test(z)) || tzs.find((z) => z && z !== curTz);
    await locale.selectOption(newLocale);
    if (newTz) await tz.selectOption(newTz);
    let t = Date.now();
    await saveBtn.dblclick().catch(() => saveBtn.click());
    await L.settle(o1);
    const puts = since(o1, t, /PUT \/api\/users\/me\/preferences/);
    R.check(puts.some((r) => r.status === 200) && await visible(page, 'Preferences saved.'), { area: 'settings', route: '/settings', role: 'own1', action: `save preferences (locale ${curLocale}→${newLocale}, timezone ${curTz}→${newTz})`, expected: 'PUT /users/me/preferences 200 and "Preferences saved."', actual: `${fmt(puts).join(', ')} saved=${await visible(page, 'Preferences saved.')}`, requests: fmt(puts), screenshot: await L.shot(page, 'settings-preferences-saved') });
    R.check(puts.length === 1, { area: 'settings', route: '/settings', role: 'own1', kind: 'double-submit', action: 'double-click Save preferences', expected: 'one PUT', actual: `${puts.length} PUT(s)`, requests: fmt(puts) });
    await page.reload(); await L.settle(o1);
    const afterLocale = await locale.inputValue(); const afterTz = await tz.inputValue();
    R.check(afterLocale === newLocale && afterTz === (newTz || curTz), { area: 'settings', route: '/settings', role: 'own1', kind: 'persist', action: 'preferences persist after refresh', expected: `${newLocale} / ${newTz}`, actual: `${afterLocale} / ${afterTz}`, readback: 'form after reload' });
    o1.prefs = { locale: newLocale, tz: newTz || curTz };

    // Change password — client-side validation paths.
    const cur = page.locator('#current-password'), np = page.locator('#new-password'), cp = page.locator('#confirm-password');
    const changeBtn = page.getByRole('button', { name: 'Change password' });
    const run = async (a, b, c) => { await cur.fill(a); await np.fill(b); await cp.fill(c); const t0 = Date.now(); await changeBtn.click(); await L.sleep(900); return { body: await txt(page, 'form[aria-labelledby=change-password-title]'), reqs: since(o1, t0, /change-password/) }; };
    let r = await run('', '', '');
    R.check(/Enter your current password/.test(r.body) && r.reqs.length === 0, { area: 'settings', route: '/settings', role: 'own1', kind: 'invalid', action: 'change password with empty fields', expected: '"Enter your current password." + policy error, no request', actual: r.body.slice(0, 200) });
    r = await run(pw1, 'short', 'short');
    R.check(/8/.test(r.body) && r.reqs.length === 0, { area: 'settings', route: '/settings', role: 'own1', kind: 'invalid', action: 'change password to a weak password', expected: 'password-policy error, no request', actual: r.body.slice(0, 200) });
    r = await run(pw1, 'Another1Pass', 'Another2Pass');
    R.check(/do not match/.test(r.body) && r.reqs.length === 0, { area: 'settings', route: '/settings', role: 'own1', kind: 'invalid', action: 'change password with mismatched confirmation', expected: '"The passwords do not match." no request', actual: r.body.slice(0, 200) });
    r = await run(pw1, pw1, pw1);
    R.check(/different from your current/.test(r.body) && r.reqs.length === 0, { area: 'settings', route: '/settings', role: 'own1', kind: 'invalid', action: 'change password to the same password', expected: '"Choose a new password that is different…" no request', actual: r.body.slice(0, 200) });
    r = await run('Wrong-current-1', 'Another1Pass', 'Another1Pass');
    R.check(/current password is not correct/i.test(r.body) && r.reqs.some((x) => x.status >= 400 && x.status < 500), { area: 'settings', route: '/settings', role: 'own1', kind: 'invalid', action: 'change password with a wrong current password', expected: 'server rejects (4xx) and "Your current password is not correct."', actual: `${r.body.slice(0, 160)} | ${fmt(r.reqs).join(',')}`, requests: fmt(r.reqs), screenshot: await L.shot(page, 'settings-change-password-wrong-current') });
  }

  // ── Change password (positive) with a second live session ────────────────
  {
    const second = await L.openIdentity(browser, 'own1');
    const lr = await L.login(second);
    R.check(lr.outcome === 'signed-in' && lr.path === '/travel-plan', { area: 'auth', route: '/login', role: 'own1', kind: 'fresh-login', action: 'fresh sign-in with the newly registered account', expected: 'signed in on /travel-plan', actual: `${lr.outcome} ${lr.path || lr.error}`, requests: [`POST /api/auth/login ${lr.loginStatus}`] });
    await second.page.goto(`${WEB}/settings`); await L.settle(second);
    const prefLocale = await second.page.locator('#pref-locale').inputValue().catch(() => null);
    R.check(prefLocale === o1.prefs.locale, { area: 'settings', route: '/settings', role: 'own1', kind: 'fresh-login', action: 'preferences are the saved ones after a fresh login', expected: o1.prefs.locale, actual: String(prefLocale) });
    const page = o1.page;
    const pw2 = newPassword();
    await page.locator('#current-password').fill(pw1);
    await page.locator('#new-password').fill(pw2);
    await page.locator('#confirm-password').fill(pw2);
    let t = Date.now();
    await page.getByRole('button', { name: 'Change password' }).dblclick();
    for (let i = 0; i < 40 && new URL(page.url()).pathname !== '/login'; i++) await L.sleep(250);
    await L.settle(o1);
    const cpReqs = since(o1, t, /POST \/api\/auth\/change-password/);
    L.setOwnPassword('own1', pw2);
    const u = new URL(page.url());
    R.check(cpReqs.some((x) => x.status < 300) && u.pathname === '/login' && u.searchParams.get('reason') === 'password-changed' && await visible(page, 'Password changed'), { area: 'settings', route: '/settings', role: 'own1', action: 'change password', expected: 'POST 2xx; signed out to /login?reason=password-changed with notice', actual: `${fmt(cpReqs).join(', ')} → ${u.pathname}${u.search} notice=${await visible(page, 'Password changed')}`, requests: fmt(cpReqs), screenshot: await L.shot(page, 'settings-password-changed') });
    R.check(cpReqs.length === 1, { area: 'settings', route: '/settings', role: 'own1', kind: 'double-submit', action: 'double-click Change password', expected: 'one request', actual: `${cpReqs.length}`, requests: fmt(cpReqs) });
    // The other session is revoked.
    t = Date.now();
    const ap = await L.api(second, 'GET', '/auth/me');
    await second.page.goto(`${WEB}/settings`); await L.settle(second);
    R.check(ap.status === 401 && new URL(second.page.url()).pathname === '/login', { area: 'settings', route: '/settings', role: 'own1', kind: 'persist', action: 'other browser session ends after password change', expected: 'API 401 with the old session; workspace sends to /login', actual: `GET /auth/me ${ap.status}; path=${new URL(second.page.url()).pathname}`, requests: [`GET /api/auth/me ${ap.status}`] });
    // Old password no longer works; new one does.
    const bad = await L.login(second, { password: pw1 });
    R.check(bad.outcome === 'error', { area: 'settings', route: '/login', role: 'own1', kind: 'invalid', action: 'old password rejected after change', expected: 'error', actual: `${bad.outcome} ${bad.error || ''}` });
    const good = await L.login(second, { password: pw2 });
    R.check(good.outcome === 'signed-in', { area: 'settings', route: '/login', role: 'own1', kind: 'fresh-login', action: 'new password accepted after change', expected: 'signed in', actual: `${good.outcome} ${good.path || good.error || ''}` });

    // Sign out everywhere: cancel, then confirm; the first browser signs in again to observe revocation.
    const first = await L.login(o1, { password: pw2 });
    await second.page.goto(`${WEB}/settings`); await L.settle(second);
    await second.page.getByRole('button', { name: 'Sign out everywhere' }).click();
    const dlg = second.page.getByRole('dialog');
    await dlg.waitFor();
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await L.sleep(400);
    const stillIn = new URL(second.page.url()).pathname === '/settings' && !(await dlg.isVisible().catch(() => false));
    R.check(stillIn, { area: 'settings', route: '/settings', role: 'own1', action: 'Sign out everywhere → Cancel', expected: 'dialog closes, still signed in', actual: `path=${new URL(second.page.url()).pathname}` });
    await second.page.getByRole('button', { name: 'Sign out everywhere' }).click();
    await dlg.waitFor();
    t = Date.now();
    await dlg.getByRole('button', { name: 'Sign out everywhere' }).click();
    for (let i = 0; i < 40 && new URL(second.page.url()).pathname !== '/login'; i++) await L.sleep(250);
    await L.settle(second);
    const lo = since(second, t, /logout-all/);
    const u2 = new URL(second.page.url());
    R.check(lo.some((x) => x.status < 300) && u2.pathname === '/login' && u2.searchParams.get('reason') === 'signed-out-everywhere', { area: 'settings', route: '/settings', role: 'own1', action: 'Sign out everywhere → confirm', expected: 'POST /auth/logout-all 2xx; /login?reason=signed-out-everywhere', actual: `${fmt(lo).join(',')} → ${u2.pathname}${u2.search}`, requests: fmt(lo), screenshot: await L.shot(second.page, 'settings-signed-out-everywhere') });
    const ap2 = await L.api(o1, 'GET', '/auth/me');
    await o1.page.goto(`${WEB}/notifications`); await L.settle(o1);
    R.check(first.outcome === 'signed-in' && ap2.status === 401 && new URL(o1.page.url()).pathname === '/login', { area: 'settings', route: '/settings', role: 'own1', kind: 'persist', action: 'other browser is signed out after "sign out everywhere"', expected: 'API 401; workspace sends to /login', actual: `first=${first.outcome} GET /auth/me ${ap2.status}; path=${new URL(o1.page.url()).pathname}` });

    // Single sign-out from the sidebar; the back button / direct URL does not reopen the workspace.
    const again = await L.login(o1, { password: pw2 });
    await o1.page.goto(`${WEB}/settings`); await L.settle(o1);
    t = Date.now();
    await o1.page.getByRole('button', { name: 'Sign out' }).first().click();
    for (let i = 0; i < 40 && new URL(o1.page.url()).pathname !== '/login'; i++) await L.sleep(250);
    await L.settle(o1);
    const lo1 = fmt(since(o1, t, /auth\/logout/));
    await o1.page.goBack().catch(() => {}); await L.settle(o1);
    const backPath = new URL(o1.page.url()).pathname;
    await o1.page.goto(`${WEB}/settings`); await L.settle(o1);
    R.check(again.outcome === 'signed-in' && lo1.some((x) => / 20\d$/.test(x)) && new URL(o1.page.url()).pathname === '/login' && backPath !== '/settings', { area: 'auth', route: '/settings', role: 'own1', action: 'Sign out (sidebar), then Back and direct URL', expected: 'POST /auth/logout 2xx; back/direct URL land on /login', actual: `${lo1.join(',')} back=${backPath} direct=${new URL(o1.page.url()).pathname}`, requests: lo1 });
    await second.ctx.close();
  }

  // ── returnTo after sign-in (fixture, read-only) ───────────────────────────
  {
    const b = await L.openIdentity(browser, 'travelerB');
    const lr = await L.login(b, { returnTo: '/notifications' });
    R.check(lr.path === '/notifications', { area: 'auth', route: '/login', role: 'travelerB', action: 'sign in with returnTo=/notifications', expected: 'lands on /notifications', actual: lr.path || lr.error });
    await b.ctx.close();
    const c = await L.openIdentity(browser, 'travelerB');
    const lr2 = await L.login(c, { returnTo: '//evil.example.com/x' });
    R.check(lr2.outcome === 'signed-in' && new URL(c.page.url()).host === 'localhost:3300', { area: 'auth', route: '/login', role: 'travelerB', kind: 'invalid', action: 'sign in with an off-site returnTo (//evil.example.com)', expected: 'ignored; stays on this site (workspace home)', actual: `${c.page.url().replace(/\?.*/, '')}` });
    await c.ctx.close();
  }

  // ── Role interest at registration does not grant provider capabilities ───
  {
    const o2 = await L.openIdentity(browser, 'own2');
    const email2 = `a10.hotelinterest.${stamp}@qa.umrahconnect.test`;
    const pw = newPassword();
    L.saveOwnAccount('own2', email2, pw, { role: 'PILGRIM', created: L.now(), roleInterest: 'hotel' });
    await o2.page.goto(`${WEB}/signup`); await L.settle(o2);
    await o2.page.getByRole('button', { name: 'Hotel / Accommodation' }).click();
    await o2.page.locator('#signup-firstName').fill('Hotel');
    await o2.page.locator('#signup-lastName').fill('Interest');
    await o2.page.locator('#signup-email').fill(email2);
    await o2.page.locator('#signup-password').fill(pw);
    const t = Date.now();
    await o2.page.locator('main button[type=submit]').first().click();
    for (let i = 0; i < 60 && new URL(o2.page.url()).pathname === '/signup'; i++) await L.sleep(250);
    await L.settle(o2);
    const perms = (o2.me?.permissions || []).slice().sort();
    R.check(!perms.some((p) => p.startsWith('hotel:')) && new URL(o2.page.url()).pathname === '/travel-plan', { area: 'auth', route: '/signup', role: 'own2', action: 'register with "Hotel / Accommodation" interest', expected: 'traveler account only (no hotel:* capability) on /travel-plan; provider access only via onboarding + KYC', actual: `path=${new URL(o2.page.url()).pathname} perms=${perms.join(',')}`, requests: fmt(since(o2, t, /auth\/register/)) });
    // Unverified account cannot register an organization.
    await o2.page.goto(`${WEB}/onboarding`); await L.settle(o2);
    const body = await txt(o2.page);
    R.check(/Confirm your email address first/i.test(body), { area: 'onboarding', route: '/onboarding', role: 'own2', kind: 'denied', action: 'unverified traveler opens organization onboarding', expected: '"Confirm your email address first" gate', actual: body.slice(0, 200), screenshot: await L.shot(o2.page, 'onboarding-unverified-gate') });
    const ob = await L.apiProbe(o2, 'POST', '/onboarding/organization', { name: `A10 Probe Org ${stamp}`, type: 'HOTEL', country: 'SA' });
    R.check(ob.status === 403, { area: 'api-refusal', route: '/onboarding', role: 'own2', kind: 'denied', action: 'API POST /onboarding/organization while unverified', expected: '403 (confirm email first)', actual: `${ob.status} ${ob.message}`, requests: [`POST /api/onboarding/organization ${ob.status}`] });
    await o2.ctx.close();
  }

  await browser.close();
  console.log(`TOTAL auth: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
