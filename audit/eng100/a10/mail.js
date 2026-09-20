/* A10 — trigger the three link emails against A10's own API instance (port 4310, same database)
 * and read the links out of that process's own log. Tokens are written to the runtime directory only;
 * nothing secret is printed or copied into evidence. */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const API = 'http://localhost:4310/api/v1';
const LOG = path.join(L.RUNTIME, 'api-mail.log');
const OUT = path.join(L.RUNTIME, 'mail-tokens.json');

async function call(method, p, body, token) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, data: json?.data, error: json?.error?.message };
}
async function signIn(email, password) {
  const r = await call('POST', '/auth/login', { email, password });
  if (r.status !== 200 || !r.data?.accessToken) throw new Error(`sign-in failed for that account (${r.status} ${r.error || ''})`);
  return r.data.accessToken;
}
function linksFromLog(sinceOffset) {
  const text = fs.readFileSync(LOG, 'utf8').slice(sinceOffset);
  const out = { verify: [], reset: [], invite: [] };
  for (const m of text.matchAll(/https?:\/\/localhost:3300\/[^\s"')]+/g)) {
    const u = m[0];
    if (u.includes('/verify-email')) out.verify.push(u);
    else if (u.includes('/reset-password')) out.reset.push(u);
    else if (u.includes('/travel-plan/link') || u.includes('/link')) out.invite.push(u);
  }
  return out;
}

(async () => {
  const own = L.ownAccounts();
  const before = fs.statSync(LOG).size;
  const result = { triggered: {}, found: {} };

  // 1. Verification email for A10's own unverified traveler.
  const t1 = await signIn(own.own1.email, own.own1.password);
  result.triggered.verify = (await call('POST', '/auth/verify-email/request', {}, t1)).status;

  // 2. Password reset for A10's second own account.
  result.triggered.reset = (await call('POST', '/auth/forgot-password', { email: own.own2.email })).status;

  // 3. Trip invitation from Operator A to travelerA's record.
  const t3 = await signIn(L.IDENT.operatorAdminA.email, L.secretOf('operatorAdminA'));
  const search = await call('GET', `/pilgrims?search=${encodeURIComponent('traveler.a@qa.umrahconnect.test')}`, null, t3);
  const rec = L.firstArray(search.data).find((x) => (x.email || '').toLowerCase() === 'traveler.a@qa.umrahconnect.test') || L.firstArray(search.data)[0];
  if (rec) {
    const links = L.firstArray((await call('GET', `/pilgrims/${rec.id}/account-links`, null, t3)).data);
    const open = links.find((l) => l.status === 'INVITED');
    const active = links.find((l) => l.status === 'ACTIVE');
    if (active) result.triggered.invite = 'already linked';
    else if (open) result.triggered.invite = (await call('POST', `/pilgrims/${rec.id}/account-links/${open.id}/resend`, {}, t3)).status;
    else result.triggered.invite = (await call('POST', `/pilgrims/${rec.id}/account-links`, {}, t3)).status;
    result.pilgrimId = rec.id;
  } else result.triggered.invite = 'no pilgrim record for traveler.a';

  await L.sleep(2500);
  const links = linksFromLog(before);
  for (const k of Object.keys(links)) result.found[k] = links[k].length;
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: L.now(), pilgrimId: result.pilgrimId, verify: links.verify.at(-1) || null, reset: links.reset.at(-1) || null, invite: links.invite.at(-1) || null }, null, 1), { mode: 0o600 });
  console.log(JSON.stringify(result));
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
