/* eslint-disable */
/**
 * A02 browser checks (W13, W14, W20, P07) — playwright-core driving the
 * installed Google Chrome, headless, one browser context per identity, always
 * signing in through the real /login form.
 *
 * Local stack for this run (see README.md in this folder):
 *   web  http://localhost:3402  (next dev)      API http://localhost:4402 (pnpm dev)
 *   stubbed Google — NOT a real Google login: test/support/google-oidc-stub.mjs on :4482
 *   mail: MAIL_DRIVER=log (local log capture, not SMTP delivery)
 *   access-token lifetime shortened to 120 s for this run so expiry happens during it
 *
 * Output: results.json (sanitized: no tokens, cookies or passwords) and screenshots.
 * Usage: API_LOG=<api log path> node browser-checks.cjs
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/macbook/Projects/umrah-connects/audit/node_modules/playwright-core');

const WEB = 'http://localhost:3402';
const OUT = __dirname;
const API_LOG = process.env.API_LOG;
const API_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'platform', 'api');
const RUN = Date.now().toString(36);
// Throwaway accounts get fresh random passwords on every run; nothing is committed.
const randomPassword = () => `A02-${require('crypto').randomBytes(9).toString('base64url')}-9a`;
const PASSWORD_A = randomPassword();
const PASSWORD_A2 = randomPassword();
const PASSWORD_B = randomPassword();
const PASSWORD_RESET = randomPassword();
const PASSWORD_MULTI = randomPassword();
// The documented demo password of the seeded accounts, supplied at run time.
const SEEDED_PASSWORD = process.env.SEEDED_PASSWORD;
if (!API_LOG || !SEEDED_PASSWORD) {
  console.error('Set API_LOG and SEEDED_PASSWORD');
  process.exit(1);
}

const results = [];
let step = 0;

// A waitForResponse left pending by a failed step must not crash the run; the
// step itself is already recorded as failed by scenario().
process.on('unhandledRejection', () => {});

function record(entry) {
  step += 1;
  const row = { step, ...entry, pass: entry.pass !== false };
  results.push(row);
  console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.step} ${row.scenario}: ${row.action} → ${row.actual}`);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  return `${name}.png`;
}

/** Last link of this kind emailed to this address, read from the API's development mail log. */
function mailedLink(email, kind) {
  const log = fs.readFileSync(API_LOG, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
  const blocks = log.split('[dev-mail]').slice(1).filter((b) => b.startsWith(` to=${email} `));
  const last = blocks.at(-1);
  if (!last) throw new Error(`no mail to ${email}`);
  const m = new RegExp(`(http://localhost:3402/${kind}\\?token=[A-Za-z0-9_\\-%]+)`).exec(last);
  if (!m) throw new Error(`no ${kind} link for ${email}`);
  return m[1];
}

function lastMailSubject(email) {
  const log = fs.readFileSync(API_LOG, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
  const blocks = log.split('[dev-mail]').slice(1).filter((b) => b.startsWith(` to=${email} `));
  const last = blocks.at(-1) ?? '';
  return { subject: (/subject="([^"]*)"/.exec(last) ?? [])[1], text: last };
}

function prisma() {
  const line = fs.readFileSync(path.join(API_DIR, '.env'), 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
  process.env.DATABASE_URL = line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
  const { PrismaClient } = require(path.join(API_DIR, 'node_modules', '@prisma', 'client'));
  return new PrismaClient();
}

async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(90_000);
  const api = [];
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/proxy-api/')) api.push({ method: res.request().method(), path: new URL(url).pathname.replace('/proxy-api', ''), status: res.status() });
  });
  return { context, page, api };
}

async function signIn(page, email, password) {
  await page.goto(`${WEB}/login`);
  await page.locator('#signin-email').fill(email);
  await page.locator('#signin-password').fill(password);
  const login = page.waitForResponse((r) => r.url().endsWith('/proxy-api/auth/login'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  return (await login).status();
}

const statuses = (api, p) => api.filter((c) => c.path === p).map((c) => `${c.method} ${p} ${c.status}`);

/** Test setup: one email with one password in two workspaces (community + an operator), for the TENANT_REQUIRED picker. */
async function ensureTwoWorkspaceAccount(db, email, password) {
  const bcrypt = require(path.join(API_DIR, 'node_modules', 'bcryptjs'));
  const hash = await bcrypt.hash(password, 12);
  const community = await db.tenant.findFirst({ where: { slug: 'umrah-connect-travelers' } });
  const operator = await db.tenant.findFirst({ where: { type: 'OPERATOR', status: 'ACTIVE', slug: { not: 'umrah-connect-travelers' } }, orderBy: { createdAt: 'asc' } });
  const roles = { PILGRIM: await db.role.findFirst({ where: { name: 'PILGRIM', tenantId: null } }), OPERATOR_STAFF: await db.role.findFirst({ where: { name: 'OPERATOR_STAFF', tenantId: null } }) };
  for (const [tenant, role] of [[community, roles.PILGRIM], [operator, roles.OPERATOR_STAFF]]) {
    const user = await db.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      create: { tenantId: tenant.id, email, passwordHash: hash, firstName: 'Multi', lastName: 'Workspace', status: 'ACTIVE', emailVerifiedAt: new Date() },
      update: { passwordHash: hash, status: 'ACTIVE', lockedUntil: null, failedLoginCount: 0 },
    });
    if (!(await db.userRole.findFirst({ where: { userId: user.id, roleId: role.id } }))) await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return operator.name;
}

async function scenario(name, fn) {
  try {
    await fn();
  } catch (err) {
    record({ scenario: name, route: '-', identity: '-', action: 'scenario aborted', expected: 'completes', actual: String(err.message).split('\n')[0].slice(0, 300), pass: false });
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const db = prisma();
  const emailA = `a02.traveler.${RUN}@example.test`;
  const emailB = `a02.expiry.${RUN}@example.test`;
  const emailG = `a02.google.${RUN}@example.test`;
  const emailP = 'traveler.b@umrahconnect.dev';

  // Opened first so that its 120-second access token has long expired when it is used again at the end.
  const refresh = await newPage(browser);
  await scenario('refresh (setup)', async () => {
    const status = await signIn(refresh.page, emailP, SEEDED_PASSWORD);
    await refresh.page.waitForURL((u) => !u.pathname.startsWith('/login'));
    record({ scenario: 'silent refresh', route: '/login', identity: emailP, action: 'password sign-in (session to be reused after expiry)', expected: '200 and workspace', actual: `${status}, ${new URL(refresh.page.url()).pathname}`, requestOutcome: `POST /auth/login ${status}`, pass: status === 200 });
    refresh.startedAt = Date.now();
  });

  // ── W20 registration + W14 banner ───────────────────────────────────────
  const a = await newPage(browser);
  await scenario('registration and unverified banner', async () => {
    const { page, api } = a;
    await page.goto(`${WEB}/signup`);
    await page.getByRole('button', { name: 'Traveler / Pilgrim' }).click();
    await page.locator('#signup-firstName').fill('Amira');
    await page.locator('#signup-lastName').fill('Tester');
    await page.locator('#signup-email').fill(emailA);
    await page.locator('#signup-password').fill(PASSWORD_A);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL('**/travel-plan', { timeout: 90_000 });
    await page.getByText('Confirm your email address').waitFor();
    record({ scenario: 'registration', route: '/signup → /travel-plan', identity: emailA, action: 'create Traveler account', expected: 'session kept, traveler workspace, unverified banner', actual: `${new URL(page.url()).pathname}, banner shown`, requestOutcome: statuses(api, '/auth/register').join(', '), persistence: 'GET /auth/me emailVerified=false', screenshot: await shot(page, '01-signup-unverified-banner') });

    const resend = page.waitForResponse((r) => r.url().endsWith('/auth/verify-email/request'));
    await page.getByRole('button', { name: 'Resend verification email' }).click();
    const res = await resend;
    await page.getByText(/You can request another email in/).waitFor();
    record({ scenario: 'unverified banner resend', route: '/travel-plan', identity: emailA, action: 'Resend verification email right after signup', expected: '429 cooldown with a wait shown', actual: (await page.getByText(/You can request another email in/).innerText()).trim(), requestOutcome: `POST /auth/verify-email/request ${res.status()}`, pass: res.status() === 429, screenshot: await shot(page, '02-banner-resend-cooldown') });
  });

  // ── W14 verify email: happy path, replay, invalid, missing ─────────────
  await scenario('verify email', async () => {
    const { page } = a;
    const link = mailedLink(emailA, 'verify-email');
    await page.goto(link);
    const confirm = page.waitForResponse((r) => r.url().endsWith('/auth/verify-email/confirm'));
    await page.getByRole('button', { name: 'Confirm email address' }).click();
    const res = await confirm;
    await page.getByText('Email confirmed').first().waitFor();
    const user = await db.user.findFirst({ where: { email: emailA }, select: { emailVerifiedAt: true } });
    record({ scenario: 'verify email (happy path)', route: '/verify-email?token=<from local log mail capture>', identity: emailA, action: 'Confirm email address', expected: 'Email confirmed; DB emailVerifiedAt set', actual: `status ${res.status()}, "Email confirmed", emailVerifiedAt ${user.emailVerifiedAt ? 'set' : 'null'}`, requestOutcome: `POST /auth/verify-email/confirm ${res.status()}`, persistence: 'core.users.email_verified_at set', pass: res.status() === 200 && !!user.emailVerifiedAt, screenshot: await shot(page, '03-verify-email-confirmed') });

    await page.goto(`${WEB}/travel-plan`);
    await page.waitForLoadState('networkidle');
    const bannerGone = (await page.getByText('Confirm your email address').count()) === 0;
    record({ scenario: 'verify email (profile refresh)', route: '/travel-plan', identity: emailA, action: 'return to workspace', expected: 'banner gone (profile re-read)', actual: bannerGone ? 'banner gone' : 'banner still shown', pass: bannerGone });

    await page.goto(link);
    const replay = page.waitForResponse((r) => r.url().endsWith('/auth/verify-email/confirm'));
    await page.getByRole('button', { name: 'Confirm email address' }).click();
    const replayRes = await replay;
    await page.getByText('Already confirmed').waitFor();
    record({ scenario: 'verify email (replayed link)', route: '/verify-email', identity: emailA, action: 'open the same link again', expected: 'Already confirmed (link used)', actual: '"Already confirmed" shown', requestOutcome: `POST /auth/verify-email/confirm ${replayRes.status()} VERIFICATION_LINK_USED`, pass: replayRes.status() === 401, screenshot: await shot(page, '04-verify-email-replayed') });

    await page.goto(`${WEB}/verify-email?token=${'Z'.repeat(43)}`);
    await page.getByRole('button', { name: 'Confirm email address' }).click();
    await page.getByText('This link is not valid').waitFor();
    record({ scenario: 'verify email (invalid link)', route: '/verify-email?token=<random>', identity: emailA, action: 'confirm a made-up token', expected: 'This link is not valid', actual: '"This link is not valid" shown' });

    await page.goto(`${WEB}/verify-email`);
    await page.getByText('Verification link required').waitFor();
    record({ scenario: 'verify email (missing token)', route: '/verify-email', identity: emailA, action: 'open without token', expected: 'Verification link required', actual: '"Verification link required" shown' });
  });

  // ── W14 expired link + resend from the verify page ──────────────────────
  const b = await newPage(browser);
  await scenario('verify email (expired)', async () => {
    const { page } = b;
    await page.goto(`${WEB}/signup`);
    await page.getByRole('button', { name: 'Traveler / Pilgrim' }).click();
    await page.locator('#signup-firstName').fill('Bilal');
    await page.locator('#signup-email').fill(emailB);
    await page.locator('#signup-password').fill(PASSWORD_B);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL('**/travel-plan', { timeout: 90_000 });
    const link = mailedLink(emailB, 'verify-email');
    const user = await db.user.findFirst({ where: { email: emailB } });
    // Test setup, stated honestly: the link is aged in the database instead of waiting 24 hours.
    await db.otpCode.updateMany({ where: { userId: user.id, purpose: 'email_verify', usedAt: null }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await page.goto(link);
    const confirm = page.waitForResponse((r) => r.url().endsWith('/auth/verify-email/confirm'));
    await page.getByRole('button', { name: 'Confirm email address' }).click();
    const res = await confirm;
    await page.getByText('This link has expired').waitFor();
    record({ scenario: 'verify email (expired link)', route: '/verify-email', identity: emailB, action: 'confirm a link aged past 24 h (expiresAt moved into the past in the dev DB)', expected: 'This link has expired + new-link button', actual: '"This link has expired" shown', requestOutcome: `POST /auth/verify-email/confirm ${res.status()} VERIFICATION_LINK_EXPIRED`, pass: res.status() === 401, screenshot: await shot(page, '05-verify-email-expired') });
    const again = page.waitForResponse((r) => r.url().endsWith('/auth/verify-email/request'));
    await page.getByRole('button', { name: 'Send a new verification email' }).click();
    const againRes = await again;
    const text = againRes.status() === 429 ? 'Please wait a moment' : 'Verification email sent';
    await page.getByText(text).waitFor();
    record({ scenario: 'verify email (request new link)', route: '/verify-email', identity: emailB, action: 'Send a new verification email', expected: 'sent, or cooldown wait if the last email is under 60 s old', actual: `"${text}" shown`, requestOutcome: `POST /auth/verify-email/request ${againRes.status()}` });
  });

  // ── W13 stubbed Google: new account round trip ──────────────────────────
  const g = await newPage(browser);
  await scenario('stubbed Google sign-in', async () => {
    const { page, api } = g;
    await page.goto(`${WEB}/login`);
    const button = page.getByRole('link', { name: 'Continue with Google' });
    await button.waitFor();
    await page.getByText('stubbed Google, not a real Google login').waitFor();
    record({ scenario: 'Google button', route: '/login', identity: 'anonymous', action: 'load sign-in page', expected: 'Continue with Google shown (status enabled) with stub label', actual: 'button + "stubbed Google, not a real Google login" note shown', screenshot: await shot(page, '06-login-google-button') });
    await button.click();
    await page.waitForURL('http://127.0.0.1:4482/**');
    await page.getByText('Stubbed Google — not a real Google login').waitFor();
    await page.locator('#email').fill(emailG);
    await page.locator('#given_name').fill('Ghada');
    await page.locator('#family_name').fill('Google');
    await shot(page, '07-stub-consent-page');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByText('Welcome to Umrah Connect, Ghada').waitFor({ timeout: 90_000 });
    const fragmentLeft = new URL(page.url()).hash;
    record({ scenario: 'stubbed Google (new account)', route: '/login → stub → /auth/callback', identity: `${emailG} (stub)`, action: 'Continue with Google, choose stub account, Continue', expected: 'Traveler created, welcome with profile prompt, fragment scrubbed', actual: `welcome shown; address fragment ${fragmentLeft ? 'STILL PRESENT' : 'removed'}`, requestOutcome: statuses(api, '/auth/google/exchange').join(', '), pass: !fragmentLeft && statuses(api, '/auth/google/exchange').join() === 'POST /auth/google/exchange 200', screenshot: await shot(page, '08-google-callback-welcome') });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL('**/travel-plan');
    await page.goto(`${WEB}/settings`);
    await page.getByText('Email me a link to set a password').waitFor();
    const created = await db.user.findFirst({ where: { email: emailG }, select: { passwordHash: true, emailVerifiedAt: true, identities: { select: { provider: true } }, userRoles: { select: { role: { select: { name: true } } } } } });
    record({ scenario: 'stubbed Google (account state)', route: '/settings', identity: `${emailG} (stub)`, action: 'open account settings', expected: 'Google linked, no password → set-a-password path, Traveler only', actual: `identities=${created.identities.map((i) => i.provider)}, roles=${created.userRoles.map((r) => r.role.name)}, password=${created.passwordHash ? 'set' : 'none'}, verified=${!!created.emailVerifiedAt}`, persistence: 'core.user_identities row + PILGRIM role', pass: created.identities.length === 1 && !created.passwordHash && created.userRoles.every((r) => r.role.name === 'PILGRIM'), screenshot: await shot(page, '09-settings-google-only') });
  });

  await scenario('stubbed Google cancellation and error code', async () => {
    const { page } = await newPage(browser);
    await page.goto(`${WEB}/login`);
    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await page.waitForURL('http://127.0.0.1:4482/**');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForURL('**/login?error=google_cancelled');
    await page.getByText('Google sign-in was cancelled').waitFor();
    record({ scenario: 'stubbed Google (cancel)', route: 'stub → /login?error=google_cancelled', identity: 'anonymous (stub)', action: 'Cancel on the provider screen', expected: 'clear cancelled message (info, not error)', actual: '"Google sign-in was cancelled" shown', screenshot: await shot(page, '10-google-cancelled') });

    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await page.waitForURL('http://127.0.0.1:4482/**');
    await page.locator('#email').fill(`a02.unverified.${RUN}@example.test`);
    await page.locator('#email_verified').uncheck();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL('**/login?error=google_email_unverified');
    await page.getByText('Your Google email is not verified').waitFor();
    const count = await db.user.count({ where: { email: `a02.unverified.${RUN}@example.test` } });
    record({ scenario: 'stubbed Google (error code)', route: '/login?error=google_email_unverified', identity: 'anonymous (stub)', action: 'provider reports the email unverified', expected: 'specific message, no account created', actual: `"Your Google email is not verified" shown; accounts created=${count}`, pass: count === 0, screenshot: await shot(page, '11-google-email-unverified') });
    await page.context().close();
  });

  // ── W20 change password → forced re-login ────────────────────────────────
  await scenario('change password', async () => {
    const { page, api } = await newPage(browser);
    await signIn(page, emailA, PASSWORD_A);
    await page.waitForURL('**/travel-plan');
    await page.goto(`${WEB}/settings`);
    await page.locator('#current-password').fill('Not-The-Password-1');
    await page.locator('#new-password').fill(PASSWORD_A2);
    await page.locator('#confirm-password').fill(PASSWORD_A2);
    const wrong = page.waitForResponse((r) => r.url().endsWith('/auth/change-password'));
    await page.getByRole('button', { name: 'Change password' }).click();
    const wrongRes = await wrong;
    await page.getByText('Your current password is not correct.').waitFor();
    record({ scenario: 'change password (wrong current)', route: '/settings', identity: emailA, action: 'submit with a wrong current password', expected: '400 CURRENT_PASSWORD_INCORRECT shown on the field, still signed in', actual: `field error shown, still on ${new URL(page.url()).pathname}`, requestOutcome: `POST /auth/change-password ${wrongRes.status()}`, pass: wrongRes.status() === 400 && page.url().endsWith('/settings'), screenshot: await shot(page, '12-change-password-wrong-current') });

    await page.locator('#current-password').fill(PASSWORD_A);
    const ok = page.waitForResponse((r) => r.url().endsWith('/auth/change-password'));
    await page.getByRole('button', { name: 'Change password' }).click();
    const okRes = await ok;
    await page.waitForURL('**/login?reason=password-changed');
    await page.getByText('Every session, including this one, was signed out').waitFor();
    record({ scenario: 'change password (success)', route: '/settings → /login?reason=password-changed', identity: emailA, action: 'submit correct current + new password', expected: 'all sessions revoked, forced re-login with explanation', actual: '"Password changed" notice on sign-in page', requestOutcome: `POST /auth/change-password ${okRes.status()}`, pass: okRes.status() === 200, screenshot: await shot(page, '13-password-changed-relogin') });

    const old = await signIn(page, emailA, PASSWORD_A);
    await page.getByText('Invalid credentials').waitFor();
    const fresh = await signIn(page, emailA, PASSWORD_A2);
    await page.waitForURL('**/travel-plan');
    record({ scenario: 'change password (re-login)', route: '/login', identity: emailA, action: 'sign in with old, then new password', expected: 'old refused (401), new accepted (200)', actual: `old ${old}, new ${fresh}`, requestOutcome: statuses(api, '/auth/login').join(', '), persistence: 'core.users.password_hash replaced', pass: old === 401 && fresh === 200 });
    await page.context().close();
  });

  // ── W20 sign out everywhere across two contexts ─────────────────────────
  await scenario('sign out everywhere', async () => {
    const one = await newPage(browser);
    const two = await newPage(browser);
    await signIn(one.page, emailA, PASSWORD_A2);
    await one.page.waitForURL('**/travel-plan');
    await signIn(two.page, emailA, PASSWORD_A2);
    await two.page.waitForURL('**/travel-plan');
    await one.page.goto(`${WEB}/settings`);
    await one.page.getByRole('button', { name: 'Sign out everywhere' }).click();
    const dialog = one.page.getByRole('dialog');
    await dialog.waitFor();
    await shot(one.page, '14-sign-out-everywhere-confirm');
    const call = one.page.waitForResponse((r) => r.url().endsWith('/auth/logout-all'));
    await dialog.getByRole('button', { name: 'Sign out everywhere' }).click();
    const res = await call;
    await one.page.waitForURL('**/login?reason=signed-out-everywhere');
    record({ scenario: 'sign out everywhere', route: '/settings', identity: `${emailA} (context 1)`, action: 'Sign out everywhere → confirm', expected: 'server revokes all sessions; local sign-out', actual: new URL(one.page.url()).pathname + new URL(one.page.url()).search, requestOutcome: `POST /auth/logout-all ${res.status()}`, pass: res.status() === 200 });

    await two.page.goto(`${WEB}/settings`);
    await two.page.waitForURL(/\/login\?/, { timeout: 90_000 });
    const url = new URL(two.page.url());
    await two.page.getByText('Your session has ended').waitFor();
    record({ scenario: 'sign out everywhere (other context)', route: '/settings', identity: `${emailA} (context 2)`, action: 'use the second browser afterwards', expected: 'session refused, bounced to /login?reason=session-expired&returnTo=/settings', actual: url.pathname + url.search, requestOutcome: [...statuses(two.api, '/auth/me'), ...statuses(two.api, '/auth/refresh').map((s) => `refresh ${s}`)].join(', '), pass: url.searchParams.get('reason') === 'session-expired' && url.searchParams.get('returnTo') === '/settings', screenshot: await shot(two.page, '15-second-context-refused') });
    await one.context.close();
    await two.context.close();
  });

  // ── W13 link Google from settings (password account) ────────────────────
  await scenario('link Google from settings', async () => {
    const { page, context } = await newPage(browser);
    await signIn(page, emailA, PASSWORD_A2);
    await page.waitForURL('**/travel-plan');
    await page.goto(`${WEB}/settings`);
    await page.getByRole('button', { name: 'Link your Google account' }).click();
    await page.waitForURL('http://127.0.0.1:4482/**');
    await page.locator('#email').fill(`a02.linked.${RUN}@example.test`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByText('Google account linked').waitFor({ timeout: 90_000 });
    await page.waitForURL('**/settings').catch(() => undefined);
    const clean = !new URL(page.url()).search;
    const ids = await db.userIdentity.count({ where: { user: { email: emailA } } });
    record({ scenario: 'link Google (settings)', route: '/settings → stub → /settings?linked=google', identity: emailA, action: 'Link your Google account', expected: 'success notice, identity listed, query cleaned', actual: `notice shown; identities=${ids}; query ${clean ? 'removed' : 'kept'}`, persistence: 'core.user_identities row for the password account', pass: ids === 1, screenshot: await shot(page, '16-settings-google-linked') });
    await context.close();
  });

  // ── P07 preferences: save → reload → fresh sign-in; honoured in email ─────
  await scenario('preferences', async () => {
    // Test setup: start from the defaults so the change below is a real change on every run.
    await db.user.update({ where: { id: (await db.user.findFirst({ where: { email: emailP } })).id }, data: { locale: 'en', timezone: 'Asia/Riyadh' } });
    const { page, context, api } = await newPage(browser);
    await signIn(page, emailP, SEEDED_PASSWORD);
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
    await page.goto(`${WEB}/settings`);
    await page.locator('#pref-locale').selectOption('ar');
    await page.locator('#pref-timezone').selectOption('Asia/Jakarta');
    const save = page.waitForResponse((r) => r.url().endsWith('/users/me/preferences') && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save preferences' }).click();
    const saved = await save;
    await page.getByText('Preferences saved.').waitFor();
    record({ scenario: 'preferences (save)', route: '/settings', identity: emailP, action: 'Email language Arabic, time zone Asia/Jakarta, Save', expected: '200 with readback', actual: '"Preferences saved." shown', requestOutcome: `PUT /users/me/preferences ${saved.status()}`, pass: saved.status() === 200, screenshot: await shot(page, '17-preferences-saved') });

    await page.reload();
    await page.locator('#pref-timezone').waitFor();
    const afterReload = { locale: await page.locator('#pref-locale').inputValue(), tz: await page.locator('#pref-timezone').inputValue() };
    record({ scenario: 'preferences (refresh)', route: '/settings', identity: emailP, action: 'reload the page', expected: 'ar / Asia/Jakarta', actual: `${afterReload.locale} / ${afterReload.tz}`, persistence: 'GET /users/me/preferences', pass: afterReload.locale === 'ar' && afterReload.tz === 'Asia/Jakarta' });
    await context.close();

    const fresh = await newPage(browser);
    await signIn(fresh.page, emailP, SEEDED_PASSWORD);
    await fresh.page.waitForURL((u) => !u.pathname.startsWith('/login'));
    await fresh.page.goto(`${WEB}/settings`);
    await fresh.page.locator('#pref-timezone').waitFor();
    const afterLogin = { locale: await fresh.page.locator('#pref-locale').inputValue(), tz: await fresh.page.locator('#pref-timezone').inputValue() };
    const row = await db.user.findFirst({ where: { email: emailP }, select: { locale: true, timezone: true } });
    record({ scenario: 'preferences (fresh sign-in)', route: '/settings', identity: `${emailP} (new context)`, action: 'sign in again in a new browser', expected: 'ar / Asia/Jakarta', actual: `${afterLogin.locale} / ${afterLogin.tz}; DB ${row.locale}/${row.timezone}`, persistence: 'core.users.locale/timezone', pass: afterLogin.locale === 'ar' && afterLogin.tz === 'Asia/Jakarta' && row.timezone === 'Asia/Jakarta', screenshot: await shot(fresh.page, '18-preferences-after-fresh-login') });

    // Honoured server-side: the password email follows the saved language and zone.
    // (A signed-in browser is sent from /login to its workspace, so a new context is used.)
    await fresh.context.close();
    const anon = await newPage(browser);
    await anon.page.goto(`${WEB}/login`);
    await anon.page.locator('#signin-email').fill(emailP);
    const forgot = anon.page.waitForResponse((r) => r.url().endsWith('/auth/forgot-password'));
    await anon.page.getByRole('button', { name: 'Forgot password?' }).click();
    const forgotRes = await forgot;
    await anon.page.waitForTimeout(500);
    const mail = lastMailSubject(emailP);
    record({ scenario: 'preferences (honoured in email)', route: '/login', identity: emailP, action: 'Forgot password?', expected: 'Arabic subject, time shown in Asia/Jakarta (local log capture, not SMTP)', actual: `subject "${mail.subject}", mentions Asia/Jakarta: ${mail.text.includes('(Asia/Jakarta)')}`, requestOutcome: `POST /auth/forgot-password ${forgotRes.status()}`, pass: mail.subject === 'إعادة تعيين كلمة المرور في Umrah Connect' && mail.text.includes('(Asia/Jakarta)') });
    await anon.context.close();
  });

  // ── W20 password reset: single use ────────────────────────────────────────
  await scenario('password reset', async () => {
    const { page, context } = await newPage(browser);
    await page.goto(`${WEB}/login`);
    await page.locator('#signin-email').fill(emailB);
    const forgot = page.waitForResponse((r) => r.url().endsWith('/auth/forgot-password'));
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    const forgotRes = await forgot;
    await page.getByText('Password reset requested').waitFor();
    const link = mailedLink(emailB, 'reset-password');
    await page.goto(link);
    await page.locator('#reset-password').fill(PASSWORD_RESET);
    await page.locator('#reset-confirm').fill(PASSWORD_RESET);
    const reset = page.waitForResponse((r) => r.url().endsWith('/auth/reset-password'));
    await page.getByRole('button', { name: 'Save new password' }).click();
    const resetRes = await reset;
    await page.getByText('Password saved').waitFor();
    record({ scenario: 'password reset', route: '/login → /reset-password?token=<from local log mail capture>', identity: emailB, action: 'Forgot password?, open link, save new password', expected: 'saved; every session signed out', actual: '"Password saved" shown', requestOutcome: `POST /auth/forgot-password ${forgotRes.status()}, POST /auth/reset-password ${resetRes.status()}`, pass: forgotRes.status() === 200 && resetRes.status() === 200, screenshot: await shot(page, '20-password-reset-saved') });

    await page.goto(link);
    const other = randomPassword();
    await page.locator('#reset-password').fill(other);
    await page.locator('#reset-confirm').fill(other);
    const replay = page.waitForResponse((r) => r.url().endsWith('/auth/reset-password'));
    await page.getByRole('button', { name: 'Save new password' }).click();
    const replayRes = await replay;
    await page.getByText('This link was already used').waitFor();
    const status = await signIn(page, emailB, PASSWORD_RESET);
    record({ scenario: 'password reset (replayed link)', route: '/reset-password', identity: emailB, action: 'use the same link again, then sign in', expected: 'already used; the first new password works', actual: `"This link was already used" shown; sign-in ${status}`, requestOutcome: `POST /auth/reset-password ${replayRes.status()} RESET_LINK_USED`, pass: replayRes.status() === 401 && status === 200 });
    await context.close();
  });

  // ── W20 multi-workspace sign-in picker ───────────────────────────────────
  await scenario('multi-workspace', async () => {
    const operatorName = await ensureTwoWorkspaceAccount(db, 'a02.multi@example.test', PASSWORD_MULTI);
    const { page, context, api } = await newPage(browser);
    const status = await signIn(page, 'a02.multi@example.test', PASSWORD_MULTI);
    await page.getByText('Choose a workspace').waitFor();
    await shot(page, '19-workspace-picker');
    const option = await page.locator('#signin-workspace option', { hasText: operatorName }).getAttribute('value');
    await page.locator('#signin-workspace').selectOption(option);
    const second = page.waitForResponse((r) => r.url().endsWith('/proxy-api/auth/login'));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const res = await second;
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
    record({ scenario: 'multi-workspace sign-in', route: '/login', identity: 'a02.multi@example.test (2 workspaces)', action: 'sign in, choose workspace, sign in', expected: 'TENANT_REQUIRED picker (info), then that workspace', actual: `first ${status}, second ${res.status()}, landed ${new URL(page.url()).pathname}`, requestOutcome: statuses(api, '/auth/login').join(', '), pass: status === 401 && res.status() === 200 });
    await context.close();
  });

  // ── Silent refresh after the 120-second access token expired ─────────────
  await scenario('silent refresh', async () => {
    const { page, api } = refresh;
    const waited = Math.round((Date.now() - refresh.startedAt) / 1000);
    if (waited < 125) await page.waitForTimeout((125 - waited) * 1000);
    await page.goto(`${WEB}/settings`);
    await page.locator('#pref-timezone').waitFor();
    // The expired token is replaced either by the background notification poll
    // (401 → refresh → retry) or by the navigation itself — both use the cookie.
    const calls = api.map((c) => `${c.method} ${c.path} ${c.status}`);
    const refreshes = calls.filter((c) => c.startsWith('POST /auth/refresh'));
    const rejected = calls.filter((c) => c.endsWith(' 401'));
    const refreshed = refreshes.includes('POST /auth/refresh 200');
    record({ scenario: 'silent refresh', route: '/travel-plan (idle) → /settings', identity: emailP, action: `stay signed in ${Math.max(waited, 125)}+ s with a 120 s access token, then navigate`, expected: 'expired token replaced via the httpOnly refresh cookie; never sent to /login', actual: `${refreshes.length} refresh call(s), ${rejected.length} request(s) rejected with 401 then retried; still on ${new URL(page.url()).pathname}`, requestOutcome: [...new Set([...rejected, ...refreshes])].join(', '), pass: refreshed && page.url().endsWith('/settings') });
    await refresh.context.close();
  });

  await browser.close();
  await db.$disconnect();
  const summary = { run: RUN, generatedAt: new Date().toISOString(), environment: { web: WEB, api: 'http://localhost:4402 (pnpm dev)', google: 'stubbed Google — not a real Google login (test/support/google-oidc-stub.mjs on :4482)', mail: 'MAIL_DRIVER=log — local log capture, not SMTP delivery', accessTokenLifetime: '120s for this run (production 15m)', browser: 'Google Chrome headless via playwright-core 1.49.1, one context per identity' }, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
})();
