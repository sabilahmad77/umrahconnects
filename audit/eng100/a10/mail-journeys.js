/* A10 — the three journeys that need a real emailed link: confirm email, reset password,
 * accept a trip invitation. Links come from A10's own API instance log (same database).
 * Tokens are used in the browser and never written to evidence. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const L = require('./lib');
const R = new L.Recorder('mail-journeys');
const WEB = L.WEB;
const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (arr) => arr.map((n) => `${n.method} ${n.path} ${n.status}`);
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
async function waitReq(id, re, t0, ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { if (since(id, t0, re).length) return true; await L.sleep(150); } return false; }
const links = JSON.parse(fs.readFileSync(path.join(L.RUNTIME, 'mail-tokens.json'), 'utf8'));
/** A link's path only — never its token — is safe to show in evidence. */
const safe = (u) => (u ? new URL(u).pathname + '?token=<redacted>' : 'none');

(async () => {
  R.reset();
  const browser = await L.launch();

  // 1. Confirm the email address with the link from the verification email.
  {
    const id = await L.openIdentity(browser, 'own1');
    if (!links.verify) R.rec({ area: 'auth', route: '/verify-email', role: 'own1', action: 'confirm email with the emailed link', expected: 'email confirmed', actual: 'no verification link in the log', result: 'UNTESTED', reason: 'mail: no link captured' });
    else {
      await id.page.goto(links.verify.replace('http://localhost:3300', WEB)); await L.settle(id);
      const btn = id.page.locator('main button').filter({ hasText: /confirm|verify/i }).first();
      const t = Date.now();
      await btn.click();
      await waitReq(id, /verify-email\/confirm/, t); await L.settle(id);
      const txt = await bodyText(id.page);
      const q = fmt(since(id, t, /verify-email\/confirm/));
      const lr = await L.login(id);
      const me = lr.outcome === 'signed-in' ? await L.api(id, 'GET', '/auth/me') : { data: null };
      R.check(q.some((x) => / 20\d$/.test(x)) && me.data?.emailVerified === true, { area: 'auth', route: '/verify-email', role: 'own1', action: `confirm the email address (${safe(links.verify)})`, expected: 'POST verify-email/confirm 2xx; /auth/me emailVerified true', actual: `${q.join(', ')} | ${(txt.match(/Email (confirmed|verified)[^.]*\./i) || [txt.slice(0, 120)])[0]} | emailVerified=${me.data?.emailVerified}`, requests: q, readback: 'GET /api/auth/me', screenshot: await L.shot(id.page, 'mail-email-confirmed') });
      // The confirm-email banner is gone, and onboarding is no longer gated.
      await id.page.goto(`${WEB}/onboarding`); await L.settle(id);
      const ob = await bodyText(id.page);
      R.check(!/Confirm your email address first/i.test(ob), { area: 'onboarding', route: '/onboarding', role: 'own1', action: 'organization onboarding after confirming the email', expected: 'the gate is lifted, the form is offered', actual: /Confirm your email address first/i.test(ob) ? 'still gated' : 'form offered', screenshot: await L.shot(id.page, 'mail-onboarding-ungated') });
      // Re-using a consumed link says so.
      await id.page.goto(links.verify.replace('http://localhost:3300', WEB)); await L.settle(id);
      const again = id.page.locator('main button').filter({ hasText: /confirm|verify/i }).first();
      if (await again.isVisible().catch(() => false)) { await again.click(); await L.sleep(1500); }
      const t2 = await bodyText(id.page);
      R.check(/already|used|no longer valid|not valid|confirmed/i.test(t2), { area: 'auth', route: '/verify-email', role: 'own1', kind: 'invalid', action: 'open the same verification link twice', expected: 'clear "already used / already confirmed" result', actual: t2.slice(t2.indexOf('Confirm your email'), t2.indexOf('Confirm your email') + 200) });
      await id.ctx.close();
    }
  }

  // 2. Reset the password with the link from the reset email.
  {
    const own = L.ownAccounts();
    const id = await L.openIdentity(browser, 'own2');
    if (!links.reset) R.rec({ area: 'auth', route: '/reset-password', role: 'own2', action: 'reset the password with the emailed link', expected: 'password replaced', actual: 'no reset link in the log', result: 'UNTESTED', reason: 'mail: no link captured' });
    else {
      const newPw = `Qa${crypto.randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x')}7`;
      await id.page.goto(links.reset.replace('http://localhost:3300', WEB)); await L.settle(id);
      const pw = id.page.locator('input[type=password]');
      // Mismatch first.
      await pw.nth(0).fill(newPw);
      if (await pw.count() > 1) await pw.nth(1).fill(`${newPw}x`);
      let t = Date.now();
      await id.page.locator('form button[type=submit]').click(); await L.sleep(800);
      const mismatch = await bodyText(id.page);
      R.check(/do not match/i.test(mismatch) && since(id, t, /reset-password/).length === 0, { area: 'auth', route: '/reset-password', role: 'own2', kind: 'invalid', action: 'reset with mismatched confirmation', expected: '"The passwords do not match." and no request', actual: (mismatch.match(/[^.]*do not match[^.]*\./i) || [mismatch.slice(0, 120)])[0] });
      if (await pw.count() > 1) await pw.nth(1).fill(newPw);
      t = Date.now();
      await id.page.locator('form button[type=submit]').click();
      await waitReq(id, /auth\/reset-password/, t); await L.settle(id);
      const q = fmt(since(id, t, /auth\/reset-password/));
      const done = await bodyText(id.page);
      const oldPw = own.own2.password;
      const bad = await L.login(id, { password: oldPw });
      L.setOwnPassword('own2', newPw);
      const good = await L.login(id, { password: newPw });
      R.check(q.some((x) => / 20\d$/.test(x)) && bad.outcome === 'error' && good.outcome === 'signed-in', { area: 'auth', route: '/reset-password', role: 'own2', action: `reset the password with the emailed link (${safe(links.reset)})`, expected: 'password replaced; old password refused; new password signs in', actual: `${q.join(', ')} | ${(done.match(/Password (saved|updated)[^.]*\./i) || [done.slice(0, 100)])[0]} | old=${bad.outcome} new=${good.outcome} (${good.path || ''})`, requests: q, screenshot: await L.shot(id.page, 'mail-password-reset') });
      // The consumed reset link cannot be used again.
      await id.page.goto(links.reset.replace('http://localhost:3300', WEB)); await L.settle(id);
      const pw2 = id.page.locator('input[type=password]');
      if (await pw2.count()) {
        for (let i = 0; i < await pw2.count(); i++) await pw2.nth(i).fill(`${newPw}z`);
        t = Date.now();
        await id.page.locator('form button[type=submit]').click();
        await waitReq(id, /auth\/reset-password/, t, 8000); await L.settle(id);
      }
      const reuse = await bodyText(id.page);
      R.check(/not valid|expired|already|no longer/i.test(reuse), { area: 'auth', route: '/reset-password', role: 'own2', kind: 'invalid', action: 'reuse a spent reset link', expected: 'refused as invalid/expired', actual: (reuse.match(/This link[^.]*\.[^.]*\./i) || [reuse.slice(0, 140)])[0], requests: fmt(since(id, t, /auth\/reset-password/)) });
      await id.ctx.close();
    }
  }

  // 3. Accept the trip invitation and see the linked trip.
  {
    const A = await L.openIdentity(browser, 'travelerA');
    const lr = await L.login(A);
    if (lr.outcome !== 'signed-in') throw new Error('travelerA sign-in failed');
    if (!links.invite) R.rec({ area: 'travel-plan', route: '/travel-plan/link', role: 'travelerA', action: 'accept a trip invitation', expected: 'trip linked', actual: 'no invitation link in the log', result: 'UNTESTED', reason: 'mail: no link captured' });
    else {
      // Another traveler must not be able to consume the invitation.
      const B = await L.openIdentity(browser, 'travelerB');
      await L.login(B);
      await B.page.goto(links.invite.replace('http://localhost:3300', WEB)); await L.settle(B);
      const bTxt = await bodyText(B.page);
      const bAccept = B.page.getByRole('button', { name: /Accept|Link/i }).first();
      let bStatus = 'no accept control';
      if (await bAccept.isVisible().catch(() => false)) {
        const t0 = Date.now();
        await bAccept.click(); await L.settle(B);
        bStatus = fmt(since(B, t0, /links\/accept/)).join(', ') || 'no request';
      }
      const bLinks = L.firstArray((await L.api(B, 'GET', '/travelers/me/links')).data);
      R.check(!bLinks.some((l) => l.status === 'ACTIVE' && /Al-Noor/.test(JSON.stringify(l))), { area: 'travel-plan', route: '/travel-plan/link', role: 'travelerB', kind: 'denied', action: "another traveler opens travelerA's invitation link", expected: 'the invitation cannot be claimed by a different account', actual: `page="${bTxt.slice(bTxt.indexOf('Trip invitation'), bTxt.indexOf('Trip invitation') + 200)}" accept=${bStatus}`, screenshot: await L.shot(B.page, 'mail-invite-wrong-account') });
      await B.ctx.close();

      const t = Date.now();
      await A.page.goto(links.invite.replace('http://localhost:3300', WEB)); await L.settle(A);
      const preview = await bodyText(A.page);
      const accept = A.page.getByRole('button', { name: /Accept|Link my account|Join/i }).first();
      const hasAccept = await accept.isVisible().catch(() => false);
      R.check(hasAccept && /Al-Noor|invitation|trip/i.test(preview), { area: 'travel-plan', route: '/travel-plan/link', role: 'travelerA', action: `open the invitation link (${safe(links.invite)})`, expected: 'preview of the organization and trip with an accept action', actual: `${preview.slice(preview.indexOf('Trip invitation'), preview.indexOf('Trip invitation') + 220)} | accept=${hasAccept}`, requests: fmt(since(A, t, /links\/preview/)), screenshot: await L.shot(A.page, 'mail-invite-preview') });
      if (hasAccept) {
        const t2 = Date.now();
        await accept.click();
        await waitReq(A, /links\/accept/, t2); await L.settle(A);
        const q = fmt(since(A, t2, /links\/accept/));
        await A.page.goto(`${WEB}/travel-plan`); await L.settle(A);
        const plan = await bodyText(A.page);
        const trips = L.firstArray((await L.api(A, 'GET', '/travelers/me/trips')).data);
        const ls = L.firstArray((await L.api(A, 'GET', '/travelers/me/links')).data);
        const orgs = trips.map((x) => x.organization?.name || x.organizationName).filter(Boolean);
        R.check(q.some((x) => / 20\d$/.test(x)) && trips.length > 0 && orgs.every((o) => plan.includes(o)), { area: 'travel-plan', route: '/travel-plan', role: 'travelerA', action: 'accept the invitation and see the linked trip', expected: 'accept 2xx; the trip and its organization appear on the travel plan', actual: `${q.join(', ')} | trips=${trips.length} orgs=${JSON.stringify(orgs)} links=${ls.length} activeLinks=${ls.filter((l) => l.status === 'ACTIVE').length}`, requests: q, readback: 'GET /api/travelers/me/trips', screenshot: await L.shot(A.page, 'mail-travel-plan-linked') });
        await A.page.reload(); await L.settle(A);
        const after = await bodyText(A.page);
        R.check(orgs.every((o) => after.includes(o)), { area: 'travel-plan', route: '/travel-plan', role: 'travelerA', kind: 'persist', action: 'linked trip after refresh', expected: 'still shown', actual: orgs.map((o) => `${o}:${after.includes(o)}`).join(' ') });
        // travelerB's plan still shows only its own organizations.
        const B2 = await L.openIdentity(browser, 'travelerB');
        await L.login(B2);
        const bTrips = L.firstArray((await L.api(B2, 'GET', '/travelers/me/trips')).data);
        const bOrgs = bTrips.map((x) => x.organization?.name || x.organizationName).filter(Boolean);
        R.check(!bOrgs.some((o) => orgs.includes(o)), { area: 'travel-plan', route: '/travel-plan', role: 'travelerB', kind: 'tenant', action: "travelerB's travel plan after travelerA linked a trip", expected: "travelerA's organization does not appear for travelerB", actual: `A=${JSON.stringify(orgs)} B=${JSON.stringify(bOrgs)}`, readback: 'GET /api/travelers/me/trips' });
        await B2.ctx.close();
      }
    }
    await A.ctx.close();
  }

  await browser.close();
  console.log(`TOTAL mail-journeys: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
