import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { api, createTestApp, TestContext, tokenFromMail } from './app';
import { Actor, bearer, buildWorld, PASSWORD, World } from './fixtures';
import { RbacService } from '../src/modules/rbac/rbac.service';

/**
 * P06 / XT-003 — traveler ↔ pilgrim link (DECISIONS.md D-022).
 *
 * Only an organization-initiated invitation, accepted by the signed-in traveler
 * account whose VERIFIED email is the invited address, links an account to a
 * pilgrim record. The link exposes status-only trip data for that one record,
 * never organization-wide reads, and ends the moment it is revoked.
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
type Method = 'get' | 'post' | 'put' | 'delete';

describe('traveler ↔ pilgrim link (P06 / D-022)', () => {
  let ctx: TestContext;
  let w: World;
  let unverified: Actor;
  let pA: any; // opA's record for traveler A (email on file in a different letter case)
  let pB: any; // opB's record carrying traveler A's email — must never be auto-attached
  let bookA: any;
  let groupA: any;
  let firstToken: string;
  let firstLinkId: string;

  const call = (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const req = ctx.http()[method](api(path)).set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const ok = async (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data;
  };
  const lastMailTo = (email: string) => [...ctx.mails].reverse().find((m) => m.to === email.toLowerCase());
  const auditEvents = async (linkId: string) =>
    (await ctx.prisma.auditLog.findMany({ where: { resource: 'pilgrim_account_link', resourceId: linkId }, orderBy: { occurredAt: 'asc' } }))
      .map((e: any) => e.metadata?.event);
  const invite = (a: Actor, pilgrimId: string, body: Record<string, unknown> = {}) => call(a, 'post', `/pilgrims/${pilgrimId}/account-links`, body);
  const answer = (a: Actor, action: 'preview' | 'accept' | 'decline', token: string) => call(a, 'post', `/travelers/me/links/${action}`, { token });

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);

    // A traveler who signed up but never confirmed their email.
    const email = `unverified-${uniq()}@people.test`;
    const u = await ctx.prisma.user.create({
      data: { tenantId: w.tenants.community, email, passwordHash: await bcrypt.hash(PASSWORD, 4), firstName: 'Una', lastName: 'Pending', status: 'PENDING_VERIFICATION' },
    });
    await ctx.app.get(RbacService).grantSystemRole(u.id, 'PILGRIM');
    const login = await ctx.http().post(api('/auth/login')).send({ email, password: PASSWORD });
    unverified = { id: u.id, email, tenantId: w.tenants.community, token: login.body.data.accessToken, refreshToken: login.body.data.refreshToken };

    pA = await ok(w.opA, 'post', '/pilgrims', {
      firstName: 'Amina', lastName: 'Rahman', email: w.travelerA.email.toUpperCase(),
      passportNumber: `QA-P-${uniq()}`, notes: 'Internal staff note: prefers ground floor',
    });
    const pkgA = await ok(w.opA, 'post', '/packages', { name: `Autumn Umrah ${uniq()}`, type: 'UMRAH', priceAdult: 1000 });
    bookA = await ok(w.opA, 'post', '/bookings', { packageId: pkgA.id, pilgrimIds: [pA.id] });
    groupA = await ok(w.opA, 'post', '/groups', { name: `October group ${uniq()}`, capacity: 20 });
    await ok(w.opA, 'post', `/groups/${groupA.id}/pilgrims`, { bookingId: bookA.id });
    const visaA = await ok(w.opA, 'post', '/compliance/visas', {
      pilgrimId: pA.id, regulatorySystem: 'NUSUK_MASAR', visaType: 'UMRAH', applicantPassport: 'QA-SECRET-PASSPORT', notes: 'Internal visa note',
    });
    await ok(w.opA, 'put', `/compliance/visas/${visaA.id}/submit`);

    pB = await ok(w.opB, 'post', '/pilgrims', { firstName: 'Amina', lastName: 'Rahman', email: w.travelerA.email, passportNumber: `QB-${uniq()}` });
    await ok(w.opB, 'post', '/compliance/visas', { pilgrimId: pB.id, regulatorySystem: 'NUSUK_MASAR', visaType: 'UMRAH' });
  });
  afterAll(async () => ctx?.close());

  it('invites the email on record; only the token hash is stored and the raw token only travels in the email', async () => {
    const res = await invite(w.opA, pA.id);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const link = res.body.data;
    expect(link).toMatchObject({ status: 'INVITED', invitedEmail: w.travelerA.email.toLowerCase(), emailSource: 'RECORD', sendCount: 1, account: null });
    expect(link.invitedBy?.name).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);

    const mail = lastMailTo(w.travelerA.email)!;
    expect(mail.subject).toContain('fx-operator-a');
    expect(mail.text).not.toContain('Amina'); // the record is not named to whoever reads the inbox
    firstToken = tokenFromMail(mail.text);
    firstLinkId = link.id;
    expect(mail.text).toContain(`http://web.test/travel-plan/link?token=${firstToken}`);

    const row = await ctx.prisma.pilgrimAccountLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(row.tokenHash).toBe(sha256(firstToken));
    expect(JSON.stringify(row)).not.toContain(firstToken);
    expect(row.tenantId).toBe(w.tenants.opA);

    const list = await ok(w.staffA, 'get', `/pilgrims/${pA.id}/account-links`);
    expect(list.map((l: any) => [l.id, l.status])).toEqual([[link.id, 'INVITED']]);
    expect(JSON.stringify(list)).not.toMatch(/tokenHash/);
    expect(await auditEvents(link.id)).toEqual(['INVITED']);
  });

  it('refuses a second invitation while one is waiting for an answer', async () => {
    const res = await invite(w.opA, pA.id, { email: 'someone.else@people.test' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVITATION_PENDING');
  });

  it('another organization cannot see, invite, resend or revoke; roles without record-update cannot invite', async () => {
    for (const [method, path, body] of [
      ['get', `/pilgrims/${pA.id}/account-links`],
      ['post', `/pilgrims/${pA.id}/account-links`, {}],
      ['post', `/pilgrims/${pA.id}/account-links/${firstLinkId}/resend`, {}],
      ['post', `/pilgrims/${pA.id}/account-links/${firstLinkId}/revoke`, { reason: 'hostile takeover' }],
      ['post', `/pilgrims/${pB.id}/account-links/${firstLinkId}/revoke`, { reason: 'hostile takeover' }],
      ['post', `/pilgrims/${pB.id}/account-links/${firstLinkId}/resend`, {}],
    ] as [Method, string, Record<string, unknown>?][]) {
      const res = await call(w.opB, method, path, body);
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    for (const actor of [w.financeA, w.hotelA, w.transportA, w.travelerA, w.travelerB]) {
      expect((await invite(actor, pA.id)).status, actor.email).toBe(403);
    }
    for (const actor of [w.financeA, w.travelerA]) {
      expect((await call(actor, 'get', `/pilgrims/${pA.id}/account-links`)).status, actor.email).toBe(403);
    }
    const row = await ctx.prisma.pilgrimAccountLink.findUniqueOrThrow({ where: { id: firstLinkId } });
    expect(row.status).toBe('INVITED');
    expect(await ctx.prisma.pilgrimAccountLink.count({ where: { pilgrimId: pA.id } })).toBe(1);
  });

  it('refuses guessed, malformed and foreign-account answers without consuming the invitation', async () => {
    const guessed = randomBytes(32).toString('base64url');
    for (const token of [guessed, 'not-a-token', firstToken.slice(0, -1), `${firstToken}x`]) {
      for (const action of ['preview', 'accept', 'decline'] as const) {
        const res = await answer(w.travelerA, action, token);
        expect(res.status, `${action} ${token.length}`).toBe(404);
        expect(res.body.error.code).toBe('INVITATION_INVALID');
      }
    }
    const operator = await answer(w.opA, 'accept', firstToken);
    expect([operator.status, operator.body.error.code]).toEqual([403, 'TRAVELER_ACCOUNT_REQUIRED']);
    for (const action of ['preview', 'accept', 'decline'] as const) {
      const other = await answer(w.travelerB, action, firstToken);
      expect([other.status, other.body.error.code]).toEqual([403, 'INVITATION_EMAIL_MISMATCH']);
      const pending = await answer(unverified, action, firstToken);
      expect([pending.status, pending.body.error.code]).toEqual([403, 'INVITATION_EMAIL_MISMATCH']);
    }
    const row = await ctx.prisma.pilgrimAccountLink.findUniqueOrThrow({ where: { id: firstLinkId } });
    expect(row.status).toBe('INVITED');
    expect(row.userId).toBeNull();
  });

  it('the invited, verified traveler previews and accepts exactly once', async () => {
    const preview = await answer(w.travelerA, 'preview', firstToken);
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ organization: { name: 'fx-operator-a' }, traveler: { name: 'Amina Rahman' } });

    const accepted = await answer(w.travelerA, 'accept', firstToken);
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.data).toMatchObject({ id: firstLinkId, organization: { name: 'fx-operator-a' }, traveler: { name: 'Amina Rahman' } });

    for (const action of ['accept', 'decline', 'preview'] as const) {
      const replay = await answer(w.travelerA, action, firstToken);
      expect([replay.status, replay.body.error.code], `replayed ${action}`).toEqual([404, 'INVITATION_INVALID']);
    }
    const row = await ctx.prisma.pilgrimAccountLink.findUniqueOrThrow({ where: { id: firstLinkId } });
    expect(row).toMatchObject({ status: 'ACTIVE', userId: w.travelerA.id, tokenHash: null });
    expect(row.acceptedAt).toBeTruthy();
    expect(await auditEvents(firstLinkId)).toEqual(['INVITED', 'LINK_ACCEPTED']);
  });

  it('shows the linked traveler status-only data for exactly that record, labelled with the organization', async () => {
    const trips = await ok(w.travelerA, 'get', '/travelers/me/trips');
    expect(trips).toHaveLength(1);
    const [trip] = trips;
    expect(trip).toMatchObject({ linkId: firstLinkId, organization: { name: 'fx-operator-a' }, traveler: { name: 'Amina Rahman' } });
    expect(trip.bookings).toHaveLength(1);
    expect(trip.bookings[0]).toMatchObject({ bookingRef: bookA.bookingRef, status: bookA.status, group: { name: groupA.name } });
    expect(trip.visas).toHaveLength(1);
    expect(trip.visas[0]).toMatchObject({ status: 'SUBMITTED', visaType: 'UMRAH' });
    const json = JSON.stringify(trips);
    for (const secret of ['QA-SECRET-PASSPORT', pA.passportNumber, 'Internal staff note', 'Internal visa note', 'priceCents', 'totalAmountCents', 'passport', 'medical', w.tenants.opA, pA.id, pB.id]) {
      expect(json, secret).not.toContain(secret);
    }
    // Same email at another organization: nothing is attached because an address matches.
    expect(trips.every((t: any) => t.organization.name === 'fx-operator-a')).toBe(true);
    expect(await ctx.prisma.pilgrimAccountLink.count({ where: { pilgrimId: pB.id } })).toBe(0);

    const links = await ok(w.travelerA, 'get', '/travelers/me/links');
    expect(links).toEqual([{ id: firstLinkId, linkedAt: expect.any(String), organization: { name: 'fx-operator-a' }, traveler: { name: 'Amina Rahman' } }]);
  });

  it('a link never grants organization-wide reads', async () => {
    for (const path of ['/pilgrims', `/pilgrims/${pA.id}`, `/pilgrims/${pA.id}/account-links`, '/bookings', `/bookings/${bookA.id}`, '/compliance/visas', `/groups/${groupA.id}`]) {
      const res = await call(w.travelerA, 'get', path);
      expect([403, 404], `${path} → ${res.status}`).toContain(res.status);
    }
  });

  it('traveler B sees nothing of A and cannot end A\'s link', async () => {
    expect(await ok(w.travelerB, 'get', '/travelers/me/trips')).toEqual([]);
    expect(await ok(w.travelerB, 'get', '/travelers/me/links')).toEqual([]);
    expect((await call(w.travelerB, 'delete', `/travelers/me/links/${firstLinkId}`)).status).toBe(404);
    expect((await call(w.opA, 'delete', `/travelers/me/links/${firstLinkId}`)).status).toBe(404);
    const row = await ctx.prisma.pilgrimAccountLink.findUniqueOrThrow({ where: { id: firstLinkId } });
    expect(row.status).toBe('ACTIVE');
  });

  it('the organization sees the linked account; revoking removes access on the very next request', async () => {
    const [current] = await ok(w.opA, 'get', `/pilgrims/${pA.id}/account-links`);
    expect(current).toMatchObject({ id: firstLinkId, status: 'ACTIVE', account: { id: w.travelerA.id, email: w.travelerA.email } });

    expect((await call(w.opA, 'post', `/pilgrims/${pA.id}/account-links/${firstLinkId}/revoke`, {})).status).toBe(400);
    expect((await call(w.opA, 'post', `/pilgrims/${pA.id}/account-links/${firstLinkId}/revoke`, { reason: ' ' })).status).toBe(400);

    const revoked = await ok(w.opA, 'post', `/pilgrims/${pA.id}/account-links/${firstLinkId}/revoke`, { reason: 'Booking moved to another agency' });
    expect(revoked).toMatchObject({ status: 'REVOKED', revokedReason: 'Booking moved to another agency' });
    expect(revoked.revokedBy?.name).toBeTruthy();

    expect(await ok(w.travelerA, 'get', '/travelers/me/trips')).toEqual([]);
    expect(await ok(w.travelerA, 'get', '/travelers/me/links')).toEqual([]);
    const again = await call(w.opA, 'post', `/pilgrims/${pA.id}/account-links/${firstLinkId}/revoke`, { reason: 'twice' });
    expect([again.status, again.body.error.code]).toEqual([409, 'LINK_NOT_REVOCABLE']);
    expect(await auditEvents(firstLinkId)).toEqual(['INVITED', 'LINK_ACCEPTED', 'LINK_REVOKED']);
  });

  it('expired invitations stop working; a resend rotates the token; a decline is final', async () => {
    const created = await invite(w.opA, pA.id);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.data.id;
    const expiredToken = tokenFromMail(lastMailTo(w.travelerA.email)!.text);
    expect(expiredToken).not.toBe(firstToken);

    await ctx.prisma.pilgrimAccountLink.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const late = await answer(w.travelerA, 'accept', expiredToken);
    expect([late.status, late.body.error.code]).toEqual([404, 'INVITATION_INVALID']);
    const [listed] = await ok(w.opA, 'get', `/pilgrims/${pA.id}/account-links`);
    expect([listed.id, listed.status]).toEqual([id, 'EXPIRED']);

    const tooSoon = await call(w.opA, 'post', `/pilgrims/${pA.id}/account-links/${id}/resend`, {});
    expect([tooSoon.status, tooSoon.body.error.code]).toEqual([409, 'RESEND_TOO_SOON']);
    await ctx.prisma.pilgrimAccountLink.update({ where: { id }, data: { lastSentAt: new Date(Date.now() - 5 * 60_000) } });
    const resent = await ok(w.opA, 'post', `/pilgrims/${pA.id}/account-links/${id}/resend`, {});
    expect(resent).toMatchObject({ id, status: 'INVITED', sendCount: 2 });
    const freshToken = tokenFromMail(lastMailTo(w.travelerA.email)!.text);
    expect(freshToken).not.toBe(expiredToken);
    expect((await answer(w.travelerA, 'accept', expiredToken)).status).toBe(404);

    const declined = await answer(w.travelerA, 'decline', freshToken);
    expect(declined.status).toBe(200);
    expect((await answer(w.travelerA, 'accept', freshToken)).status).toBe(404);
    const row = await ctx.prisma.pilgrimAccountLink.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'DECLINED', tokenHash: null, userId: null });
    const resendDeclined = await call(w.opA, 'post', `/pilgrims/${pA.id}/account-links/${id}/resend`, {});
    expect([resendDeclined.status, resendDeclined.body.error.code]).toEqual([409, 'INVITATION_NOT_PENDING']);
    expect(await auditEvents(id)).toEqual(['INVITED', 'INVITATION_RESENT', 'INVITATION_DECLINED']);
    expect(await ok(w.travelerA, 'get', '/travelers/me/trips')).toEqual([]);
  });

  it('an address typed by staff is recorded, and an unverified account cannot accept until it verifies', async () => {
    const noEmail = await ok(w.opA, 'post', '/pilgrims', { firstName: 'Yusuf', lastName: 'Karim', passportNumber: `QA-P-${uniq()}` });
    const missing = await invite(w.opA, noEmail.id);
    expect([missing.status, missing.body.error.code]).toEqual([400, 'EMAIL_REQUIRED']);
    expect((await invite(w.opA, noEmail.id, { email: 'not-an-email' })).status).toBe(400);

    const created = await invite(w.opA, noEmail.id, { email: `  ${unverified.email.toUpperCase()} ` });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data).toMatchObject({ invitedEmail: unverified.email, emailSource: 'ENTERED' });
    const token = tokenFromMail(lastMailTo(unverified.email)!.text);

    for (const action of ['preview', 'accept', 'decline'] as const) {
      const res = await answer(unverified, action, token);
      expect([res.status, res.body.error.code], action).toEqual([403, 'EMAIL_NOT_VERIFIED']);
    }
    await ctx.prisma.user.update({ where: { id: unverified.id }, data: { emailVerifiedAt: new Date(), status: 'ACTIVE' } });
    const accepted = await answer(unverified, 'accept', token);
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    const [trip] = await ok(unverified, 'get', '/travelers/me/trips');
    expect(trip).toMatchObject({ traveler: { name: 'Yusuf Karim' }, bookings: [], visas: [] });

    // The traveler can end the link themselves; the organization sees who ended it.
    const ended = await ok(unverified, 'delete', `/travelers/me/links/${accepted.body.data.id}`);
    expect(ended).toEqual({ id: accepted.body.data.id, status: 'UNLINKED' });
    expect(await ok(unverified, 'get', '/travelers/me/trips')).toEqual([]);
    const [listed] = await ok(w.opA, 'get', `/pilgrims/${noEmail.id}/account-links`);
    expect(listed).toMatchObject({ status: 'UNLINKED', account: { id: unverified.id } });
    expect(await auditEvents(accepted.body.data.id)).toEqual(['INVITED', 'LINK_ACCEPTED', 'LINK_ENDED_BY_TRAVELER']);
    expect((await call(unverified, 'delete', `/travelers/me/links/${accepted.body.data.id}`)).status).toBe(404);
  });

  it('an archived record disappears from the traveler view', async () => {
    const record = await ok(w.opA, 'post', '/pilgrims', { firstName: 'Bilal', lastName: 'Hamid', email: w.travelerB.email, passportNumber: `QA-P-${uniq()}` });
    await ok(w.opA, 'post', `/pilgrims/${record.id}/account-links`, {});
    const token = tokenFromMail(lastMailTo(w.travelerB.email)!.text);
    expect((await answer(w.travelerB, 'accept', token)).status).toBe(200);
    expect(await ok(w.travelerB, 'get', '/travelers/me/trips')).toHaveLength(1);
    await ok(w.opA, 'delete', `/pilgrims/${record.id}`);
    expect(await ok(w.travelerB, 'get', '/travelers/me/trips')).toEqual([]);
    expect(await ok(w.travelerB, 'get', '/travelers/me/links')).toEqual([]);
    expect((await invite(w.opA, record.id)).status).toBe(404);
  });

  it('the database itself allows one ACTIVE link and one open invitation per record', async () => {
    const record = await ok(w.opA, 'post', '/pilgrims', { firstName: 'Maryam', lastName: 'Saleh', passportNumber: `QA-P-${uniq()}` });
    const base = { tenantId: w.tenants.opA, pilgrimId: record.id, invitedEmail: 'x@people.test', invitedBy: w.opA.id, expiresAt: new Date(Date.now() + 86_400_000) };
    await ctx.prisma.pilgrimAccountLink.create({ data: { ...base, status: 'ACTIVE', userId: w.travelerA.id, acceptedAt: new Date() } });
    const unique = { code: 'P2002' };
    await expect(ctx.prisma.pilgrimAccountLink.create({ data: { ...base, status: 'ACTIVE', userId: w.travelerB.id, acceptedAt: new Date() } })).rejects.toMatchObject(unique);
    await expect(ctx.prisma.pilgrimAccountLink.create({ data: { ...base, status: 'ACTIVE', userId: w.travelerA.id, acceptedAt: new Date() } })).rejects.toMatchObject(unique);
    await ctx.prisma.pilgrimAccountLink.create({ data: { ...base, tokenHash: sha256(uniq()) } });
    await expect(ctx.prisma.pilgrimAccountLink.create({ data: { ...base, tokenHash: sha256(uniq()) } })).rejects.toMatchObject(unique);
    // CHECK constraints: an ACTIVE link names its account; an open invitation has a token hash.
    const other = await ok(w.opA, 'post', '/pilgrims', { firstName: 'Omar', lastName: 'Nabil', passportNumber: `QA-P-${uniq()}` });
    await expect(ctx.prisma.pilgrimAccountLink.create({ data: { ...base, pilgrimId: other.id, status: 'ACTIVE' } })).rejects.toThrow(/pilgrim_account_links_active_has_account/);
    await expect(ctx.prisma.pilgrimAccountLink.create({ data: { ...base, pilgrimId: other.id } })).rejects.toThrow(/pilgrim_account_links_invite_has_token/);
  });
});
