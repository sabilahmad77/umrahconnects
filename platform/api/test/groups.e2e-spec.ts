import * as bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, PASSWORD, World } from './fixtures';

/**
 * Trip groups from both sides: the managing organization (CRM capabilities) and
 * its members (travelers). Members use the discussion and polls; everything
 * else stays with the organization. Refusals are checked against the database.
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Attempt = [Method, string, Record<string, unknown>?];

describe('groups: invitations, member discussion, polls, join/leave and management boundaries', () => {
  let ctx: TestContext;
  let w: World;
  let group: any;
  /** Operator A's finance manager, owned by this suite (other suites grant the shared fixture more roles). */
  let financeOnly: Actor;

  const call = (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const req = ctx.http()[method](api(path)).set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const ok = async (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    expect(res.body.success).toBe(true);
    return res.body.data;
  };
  const refused = async (a: Actor, attempts: Attempt[], allowed: number[] = [404]) => {
    for (const [method, path, body] of attempts) {
      const res = await call(a, method, path, body ?? (method === 'get' || method === 'delete' ? undefined : {}));
      expect(allowed, `${a.email} ${method.toUpperCase()} ${path} → ${res.status}`).toContain(res.status);
    }
  };
  const newGroup = (body: Record<string, unknown> = {}) =>
    ok(w.opA, 'post', '/groups', { name: `Group ${uniq()}`, visibility: 'PRIVATE', notes: 'secret briefing', ...body });

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
    group = await newGroup();
    const email = 'groups-finance@op-a.test';
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const u = await ctx.prisma.user.upsert({
      where: { tenantId_email: { tenantId: w.tenants.opA, email } },
      create: { tenantId: w.tenants.opA, email, passwordHash, firstName: 'Finance', lastName: 'Only', status: 'ACTIVE', emailVerifiedAt: new Date() },
      update: { passwordHash, status: 'ACTIVE', lockedUntil: null, failedLoginCount: 0, sessionsRevokedAt: null },
    });
    await ctx.app.get(RbacService).grantSystemRole(u.id, 'FINANCE_MANAGER');
    const login = await ctx.http().post(api('/auth/login')).send({ email, password: PASSWORD });
    financeOnly = { id: u.id, email, tenantId: w.tenants.opA, token: login.body.data.accessToken, refreshToken: login.body.data.refreshToken };
  });
  afterAll(async () => ctx?.close());

  it('an invitation by email reaches the traveler, who sees the safe view, accepts and becomes a member', async () => {
    expect((await call(w.travelerA, 'get', `/groups/${group.id}`)).status).toBe(404);

    const invite = await ok(w.opA, 'post', `/groups/${group.id}/invites`, { inviteeEmail: w.travelerA.email.toUpperCase(), message: 'Join us' });
    expect(invite).toMatchObject({ status: 'PENDING', inviteeEmail: w.travelerA.email, notified: 1 });
    expect((await call(w.opA, 'post', `/groups/${group.id}/invites`, { inviteeEmail: w.travelerA.email })).status).toBe(409);

    const note = (await ok(w.travelerA, 'get', '/notifications?limit=50')).items.find((n: any) => n.data?.inviteId === invite.id);
    expect(note).toMatchObject({ type: 'GROUP_INVITE', link: `/social/groups/${group.id}` });
    const mine = await ok(w.travelerA, 'get', '/groups/invites/mine');
    expect(mine.map((i: any) => i.id)).toContain(invite.id);
    expect(JSON.stringify(mine)).not.toContain('secret briefing');
    expect(JSON.stringify(await ok(w.travelerB, 'get', '/groups/invites/mine'))).not.toContain(invite.id);

    const view = await ok(w.travelerA, 'get', `/groups/${group.id}`);
    expect(view.viewer).toMatchObject({ canManage: false, canRead: false, membership: null, pendingInvite: { id: invite.id } });
    for (const k of ['briefingNotes', 'emergencyContact', 'itinerary', 'tenantId', 'createdBy', 'incidents']) expect(view, k).not.toHaveProperty(k);
    expect((await call(w.travelerB, 'get', `/groups/${group.id}`)).status).toBe(404);

    await refused(w.travelerB, [['post', `/groups/invites/${invite.id}/respond`, { accept: true }]]);
    expect((await ctx.prisma.groupInvite.findUniqueOrThrow({ where: { id: invite.id } })).status).toBe('PENDING');

    const before = (await ctx.prisma.tripGroup.findUniqueOrThrow({ where: { id: group.id } })).enrolledCount;
    expect((await ok(w.travelerA, 'post', `/groups/invites/${invite.id}/respond`, { accept: true })).status).toBe('ACCEPTED');
    expect((await ctx.prisma.tripGroup.findUniqueOrThrow({ where: { id: group.id } })).enrolledCount).toBe(before + 1);
    expect((await call(w.travelerA, 'post', `/groups/invites/${invite.id}/respond`, { accept: true })).status).toBe(409);
    expect((await ctx.prisma.notification.findUniqueOrThrow({ where: { id: note.id } })).readAt).not.toBeNull();

    expect((await ok(w.travelerA, 'get', '/groups/mine')).map((g: any) => g.id)).toContain(group.id);
    const memberView = await ok(w.travelerA, 'get', `/groups/${group.id}`);
    expect(memberView.viewer).toMatchObject({ canManage: false, canRead: true, membership: { role: 'MEMBER' } });
    expect(memberView).not.toHaveProperty('briefingNotes');
    const managerView = await ok(w.opA, 'get', `/groups/${group.id}`);
    expect(managerView).toMatchObject({ briefingNotes: 'secret briefing', viewer: { canManage: true } });

    // Inviting someone who is already a member is refused.
    expect((await call(w.opA, 'post', `/groups/${group.id}/invites`, { inviteeEmail: w.travelerA.email })).status).toBe(409);
  });

  it('members read and write the discussion; outsiders and capability-less staff are refused', async () => {
    const pinned = await ok(w.opA, 'post', `/groups/${group.id}/posts`, { body: 'Bus leaves at 6', isPinned: true });
    const own = await ok(w.travelerA, 'post', `/groups/${group.id}/posts`, { body: 'Where do we meet?', isPinned: true });
    expect([pinned.isPinned, own.isPinned]).toEqual([true, false]);

    const list = await ok(w.travelerA, 'get', `/groups/${group.id}/posts?limit=10`);
    expect(list.items[0].id).toBe(pinned.id);
    expect(list.items.find((p: any) => p.id === own.id)).toMatchObject({ isMine: true, canDelete: true, authorName: 'traveler-a Fixture' });
    expect(list.items.find((p: any) => p.id === pinned.id)).toMatchObject({ isMine: false, canDelete: false });
    expect(list.total).toBe(2);

    const comment = await ok(w.travelerA, 'post', `/groups/posts/${pinned.id}/comments`, { body: 'Thanks' });
    const staffComment = await ok(w.staffA, 'post', `/groups/posts/${pinned.id}/comments`, { body: 'Be on time' });
    const comments = await ok(w.travelerA, 'get', `/groups/posts/${pinned.id}/comments`);
    expect(comments.map((c: any) => [c.body, c.isMine, c.canDelete])).toEqual([['Thanks', true, true], ['Be on time', false, false]]);

    // Outsiders: another traveler, another organization, and same-organization staff without CRM capabilities.
    expect((await ok(financeOnly, 'get', '/auth/me')).permissions).not.toContain('crm:pilgrim:read');
    for (const outsider of [w.travelerB, w.opB, financeOnly]) {
      await refused(outsider, [
        ['get', `/groups/${group.id}/posts`],
        ['post', `/groups/${group.id}/posts`, { body: 'spam' }],
        ['get', `/groups/posts/${pinned.id}/comments`],
        ['post', `/groups/posts/${pinned.id}/comments`, { body: 'spam' }],
        ['delete', `/groups/posts/${pinned.id}`],
        ['delete', `/groups/posts/${pinned.id}/comments/${comment.id}`],
        ['get', `/groups/${group.id}/polls`],
      ]);
    }
    // A member cannot delete someone else's post or comment.
    await refused(w.travelerA, [
      ['delete', `/groups/posts/${pinned.id}`],
      ['delete', `/groups/posts/${pinned.id}/comments/${staffComment.id}`],
    ]);
    expect(await ctx.prisma.groupPost.count({ where: { groupId: group.id } })).toBe(2);
    expect(await ctx.prisma.groupPostComment.count({ where: { postId: pinned.id } })).toBe(2);

    await ok(w.travelerA, 'delete', `/groups/posts/${pinned.id}/comments/${comment.id}`);
    await ok(w.staffA, 'delete', `/groups/posts/${own.id}`);
    expect(await ctx.prisma.groupPost.count({ where: { id: own.id } })).toBe(0);
    expect(await ctx.prisma.groupPostComment.count({ where: { postId: pinned.id } })).toBe(1);
    expect((await call(w.travelerA, 'post', `/groups/${group.id}/posts`, { body: '   ' })).status).toBe(400);
  });

  it('polls: the organization creates and closes them; members vote and change their vote; votes stay private', async () => {
    const poll = await ok(w.opA, 'post', `/groups/${group.id}/polls`, { question: 'Leave the hotel at?', options: ['6am', '7am'] });
    expect((await call(w.travelerA, 'post', `/groups/${group.id}/polls`, { question: 'x', options: ['a', 'b'] })).status).toBe(403);
    expect((await call(w.opA, 'post', `/groups/${group.id}/polls`, { question: 'x', options: ['a', 'A'] })).status).toBe(400);
    expect((await call(w.opA, 'post', `/groups/${group.id}/polls`, { question: 'x', options: ['a', 'b'], closesAt: new Date(Date.now() - 60_000).toISOString() })).status).toBe(400);

    expect((await ok(w.travelerA, 'post', `/groups/polls/${poll.id}/vote`, { optionIndices: [0] })).myVotes).toEqual([0]);
    await ok(w.travelerA, 'post', `/groups/polls/${poll.id}/vote`, { optionIndices: [1] });
    expect((await call(w.travelerA, 'post', `/groups/polls/${poll.id}/vote`, { optionIndices: [5] })).status).toBe(400);
    expect((await call(w.travelerA, 'post', `/groups/polls/${poll.id}/vote`, { optionIndices: [0, 1] })).status).toBe(400);
    await refused(w.travelerB, [['post', `/groups/polls/${poll.id}/vote`, { optionIndices: [0] }]]);
    await refused(w.travelerA, [['post', `/groups/polls/${poll.id}/close`]], [403]);

    const [seen] = (await ok(w.travelerA, 'get', `/groups/${group.id}/polls`)).filter((p: any) => p.id === poll.id);
    expect(seen).toMatchObject({ myVotes: [1], voteCount: 1, voterCount: 1, isClosed: false, canClose: false });
    expect(seen.breakdown.map((o: any) => o.count)).toEqual([0, 1]);
    expect(seen).not.toHaveProperty('votes');
    expect(await ctx.prisma.groupPollVote.count({ where: { pollId: poll.id } })).toBe(1);

    const [asManager] = (await ok(w.opA, 'get', `/groups/${group.id}/polls`)).filter((p: any) => p.id === poll.id);
    expect(asManager.canClose).toBe(true);
    await ok(w.opA, 'post', `/groups/polls/${poll.id}/close`);
    expect((await call(w.travelerA, 'post', `/groups/polls/${poll.id}/vote`, { optionIndices: [0] })).status).toBe(403);
    const [closed] = (await ok(w.travelerA, 'get', `/groups/${group.id}/polls`)).filter((p: any) => p.id === poll.id);
    expect(closed).toMatchObject({ status: 'CLOSED', isClosed: true, myVotes: [1] });
  });

  it('join and leave: public groups open, unlisted by link, private refused, full groups refused', async () => {
    const pub = await newGroup({ visibility: 'PUBLIC', capacity: 1 });
    const unlisted = await newGroup({ visibility: 'unlisted' });
    expect(unlisted.visibility).toBe('UNLISTED');

    await ok(w.travelerB, 'post', `/groups/${pub.id}/join`);
    expect((await call(w.travelerA, 'post', `/groups/${pub.id}/join`)).status).toBe(409);
    expect(await ctx.prisma.groupMember.count({ where: { groupId: pub.id, userId: w.travelerA.id } })).toBe(0);

    expect((await ok(w.travelerB, 'get', `/groups/${unlisted.id}`)).viewer).toMatchObject({ canJoin: true, membership: null });
    expect(JSON.stringify(await ok(w.travelerB, 'get', '/groups/public?limit=100'))).not.toContain(unlisted.id);
    await ok(w.travelerB, 'post', `/groups/${unlisted.id}/join`);
    expect((await ok(w.travelerB, 'get', `/groups/${unlisted.id}/posts`)).items).toEqual([]);

    const priv = await newGroup();
    expect((await call(w.travelerB, 'get', `/groups/${priv.id}`)).status).toBe(404);
    expect((await call(w.travelerB, 'post', `/groups/${priv.id}/join`)).status).toBe(403);

    await ok(w.travelerB, 'post', `/groups/${pub.id}/leave`);
    expect((await ctx.prisma.tripGroup.findUniqueOrThrow({ where: { id: pub.id } })).enrolledCount).toBe(0);
    expect((await ok(w.travelerB, 'get', '/groups/mine')).map((g: any) => g.id)).not.toContain(pub.id);
    await ok(w.travelerA, 'post', `/groups/${pub.id}/join`);
  });

  it('management stays with the organization: invites can be revoked, links must be http(s), members cannot manage', async () => {
    const inv = await ok(w.opA, 'post', `/groups/${group.id}/invites`, { inviteeEmail: w.travelerB.email });
    await refused(w.opB, [['post', `/groups/invites/${inv.id}/revoke`]]);
    await refused(w.travelerB, [['post', `/groups/invites/${inv.id}/revoke`]], [403]);
    expect((await ok(w.opA, 'post', `/groups/invites/${inv.id}/revoke`)).status).toBe('REVOKED');
    expect((await call(w.opA, 'post', `/groups/invites/${inv.id}/revoke`)).status).toBe(409);
    expect((await call(w.travelerB, 'post', `/groups/invites/${inv.id}/respond`, { accept: true })).status).toBe(409);
    expect(JSON.stringify(await ok(w.travelerB, 'get', '/groups/invites/mine'))).not.toContain(inv.id);
    expect(await ctx.prisma.groupMember.count({ where: { groupId: group.id, userId: w.travelerB.id } })).toBe(0);

    for (const url of ['javascript:alert(document.cookie)', 'data:text/html,<script>x</script>', 'files/roster.pdf']) {
      expect((await call(w.opA, 'post', `/groups/${group.id}/documents`, { name: 'Roster', url })).status, url).toBe(400);
    }
    await ok(w.opA, 'post', `/groups/${group.id}/documents`, { name: 'Roster', url: 'https://files.example/roster.pdf' });

    // A member (traveler) holds no CRM capability: every management route is refused.
    await refused(w.travelerA, [
      ['put', `/groups/${group.id}`, { name: 'Hijacked' }],
      ['delete', `/groups/${group.id}`],
      ['get', `/groups/${group.id}/members`],
      ['get', `/groups/${group.id}/invites`],
      ['post', `/groups/${group.id}/invites`, { inviteeEmail: 'friend@people.test' }],
      ['get', `/groups/${group.id}/notes`],
      ['get', `/groups/${group.id}/documents`],
      ['get', `/groups/${group.id}/incidents`],
      ['get', `/groups/${group.id}/related`],
      ['get', '/groups'],
      ['get', '/groups/stats'],
    ], [403]);
    expect((await ctx.prisma.tripGroup.findUniqueOrThrow({ where: { id: group.id } })).name).toBe(group.name);

    expect((await call(w.opA, 'post', '/groups', { name: 'x', visibility: 'SECRET' })).status).toBe(400);
    expect((await call(w.opA, 'put', `/groups/${group.id}`, { status: 'PARTYING' })).status).toBe(400);
    expect((await call(w.opA, 'put', `/groups/${group.id}`, { capacity: 0 })).status).toBe(400);
    expect((await ok(w.opA, 'put', `/groups/${group.id}`, { status: 'active' })).status).toBe('ACTIVE');
  });

  it('deleting a group with incident reports is refused; a group without them is removed with its content', async () => {
    const kept = await newGroup();
    await ok(w.opA, 'post', `/groups/${kept.id}/incidents`, { type: 'MEDICAL', severity: 'HIGH', description: 'Heat exhaustion' });
    const refusal = await call(w.opA, 'delete', `/groups/${kept.id}`);
    expect(refusal.status).toBe(409);
    expect(refusal.body.error.message).toContain('1 incident report');
    expect(await ctx.prisma.tripGroup.count({ where: { id: kept.id } })).toBe(1);

    const incident = (await ok(w.opA, 'get', `/groups/${kept.id}/incidents`))[0];
    const resolved = await ok(w.opA, 'put', `/groups/${kept.id}/incidents/${incident.id}`, { resolution: 'Treated on site', resolvedAt: new Date().toISOString() });
    expect(resolved.resolution).toBe('Treated on site');
    expect((await ok(w.opA, 'get', '/groups/stats')).openIncidents).toBeGreaterThanOrEqual(0);

    const gone = await newGroup();
    await ok(w.opA, 'post', `/groups/${gone.id}/notes`, { title: 'Plan' });
    await ok(w.opA, 'post', `/groups/${gone.id}/documents`, { name: 'Map', url: 'https://files.example/map.pdf' });
    const p = await ok(w.opA, 'post', `/groups/${gone.id}/posts`, { body: 'Hello' });
    await ok(w.opA, 'post', `/groups/posts/${p.id}/comments`, { body: 'Hi' });
    await ok(w.opA, 'delete', `/groups/${gone.id}`);
    expect(await ctx.prisma.tripGroup.count({ where: { id: gone.id } })).toBe(0);
    expect(await ctx.prisma.groupDocument.count({ where: { groupId: gone.id } })).toBe(0);
    expect(await ctx.prisma.groupPost.count({ where: { groupId: gone.id } })).toBe(0);
  });
});
