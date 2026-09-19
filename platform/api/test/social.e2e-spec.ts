import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';

/**
 * Social actions end to end through the HTTP API: request → validation →
 * authorization → persistence → readback. Every refusal is followed by a
 * database read proving the victim's record did not change.
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Attempt = [Method, string, Record<string, unknown>?];

describe('social: posts, comments, replies, reactions, saves, follows, connections and messages', () => {
  let ctx: TestContext;
  let w: World;

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  const call = (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const req = ctx.http()[method](api(path)).set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const ok = async (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    expect(res.body.success, `${method} ${path} envelope`).toBe(true);
    return res.body.data;
  };
  const refused = async (a: Actor, attempts: Attempt[], allowed: number[] = [404]) => {
    for (const [method, path, body] of attempts) {
      const res = await call(a, method, path, body ?? (method === 'get' || method === 'delete' ? undefined : {}));
      expect(allowed, `${a.email} ${method.toUpperCase()} ${path} → ${res.status}`).toContain(res.status);
    }
  };
  const post = (a: Actor, body: Record<string, unknown>) => ok(a, 'post', '/social/posts', { type: 'UPDATE', ...body });
  const notificationsOf = async (a: Actor) => (await ok(a, 'get', '/notifications?limit=50')).items as any[];

  describe('accounts', () => {
    it('auto-created accounts carry the user\'s real name and type, and legacy placeholders are repaired', async () => {
      const me = await ok(w.travelerA, 'get', '/social/accounts/me');
      expect(me.displayName).toBe('traveler-a Fixture');
      expect(me.type).toBe('PILGRIM');
      const op = await ok(w.opA, 'get', '/social/accounts/me');
      expect(op.displayName).toBe('admin Fixture');
      expect(op.type).toBe('OPERATOR');

      await ctx.prisma.socialAccount.update({ where: { id: me.id }, data: { displayName: 'User', type: 'OPERATOR' } });
      const repaired = await ok(w.travelerA, 'get', '/social/accounts/me');
      expect([repaired.id, repaired.displayName, repaired.type]).toEqual([me.id, 'traveler-a Fixture', 'PILGRIM']);
    });
  });

  describe('posts', () => {
    it('the author creates, edits and deletes a post; another traveler sees it but cannot change it', async () => {
      const p = await post(w.travelerA, { content: `Hello pilgrims ${uniq()}`, tags: ['#Umrah', 'makkah', 'umrah'] });
      expect(p).toMatchObject({ isMine: true, likeCount: 0, commentCount: 0, saveCount: 0, likedByMe: false, savedByMe: false, editedAt: null });
      expect(p.tags).toEqual(['umrah', 'makkah']);
      expect(p.author.displayName).toBe('traveler-a Fixture');

      const feedB = await ok(w.travelerB, 'get', '/social/feed?limit=100');
      const seen = feedB.items.find((x: any) => x.id === p.id);
      expect(seen).toMatchObject({ isMine: false, body: p.body });
      for (const k of ['moderationStatus', 'moderationNotes', 'moderatedBy', 'targetRoles']) expect(seen, k).not.toHaveProperty(k);

      await refused(w.travelerB, [
        ['put', `/social/posts/${p.id}`, { content: 'Hacked' }],
        ['delete', `/social/posts/${p.id}`],
      ]);
      await refused(w.opA, [['put', `/social/posts/${p.id}`, { content: 'Hacked by operator' }]]);
      let row = await ctx.prisma.post.findUniqueOrThrow({ where: { id: p.id } });
      expect([row.body, row.deletedAt, row.editedAt]).toEqual([p.body, null, null]);

      const edited = await ok(w.travelerA, 'put', `/social/posts/${p.id}`, { content: 'Edited words', visibility: 'FOLLOWER_SET' });
      expect(edited).toMatchObject({ body: 'Edited words', visibility: 'FOLLOWER_SET', isMine: true });
      expect(edited.editedAt).toBeTruthy();
      // B does not follow A, so the followers-only post disappears for B but stays in A's own feed.
      expect((await call(w.travelerB, 'get', `/social/posts/${p.id}`)).status).toBe(404);
      expect((await ok(w.travelerA, 'get', '/social/feed?limit=100')).items.map((x: any) => x.id)).toContain(p.id);

      expect((await call(w.travelerA, 'put', `/social/posts/${p.id}`, { content: '   ' })).status).toBe(400);
      expect((await call(w.travelerA, 'put', `/social/posts/${p.id}`, { visibility: 'ROLE_SET' })).status).toBe(400);

      const del = await ok(w.travelerA, 'delete', `/social/posts/${p.id}`);
      expect(del).toEqual({ id: p.id, deleted: true });
      expect((await call(w.travelerA, 'get', `/social/posts/${p.id}`)).status).toBe(404);
      expect((await call(w.travelerA, 'delete', `/social/posts/${p.id}`)).status).toBe(404);
      row = await ctx.prisma.post.findUniqueOrThrow({ where: { id: p.id } });
      expect(row.deletedAt).not.toBeNull();
    });

    it('audiences: only-me, role-targeted and followers-only posts reach exactly their audience', async () => {
      const onlyMe = await post(w.travelerA, { content: `only me ${uniq()}`, visibility: 'CUSTOM_SET' });
      const hotels = await post(w.opA, { content: `hotels only ${uniq()}`, visibility: 'ROLE_SET', targetRoles: ['HOTEL_MANAGER'] });
      expect((await call(w.travelerB, 'get', `/social/posts/${onlyMe.id}`)).status).toBe(404);
      expect((await call(w.travelerA, 'get', `/social/posts/${onlyMe.id}`)).status).toBe(200);
      expect((await call(w.hotelA, 'get', `/social/posts/${hotels.id}`)).status).toBe(200);
      expect((await call(w.travelerB, 'get', `/social/posts/${hotels.id}`)).status).toBe(404);
      const own = await ok(w.opA, 'get', `/social/posts/${hotels.id}`);
      expect(own.targetRoles).toEqual(['HOTEL_MANAGER']);
      expect((await call(w.travelerA, 'post', '/social/posts', { content: 'x', visibility: 'ROLE_SET' })).status).toBe(400);
    });

    it('post images must be media uploaded to Umrah Connect', async () => {
      for (const url of ['https://tracker.test/pixel.gif', '/uploads/../private/passport.pdf', 'javascript:alert(1)', '/uploads/.hidden']) {
        expect((await call(w.travelerA, 'post', '/social/posts', { content: 'x', mediaUrls: [url] })).status, url).toBe(400);
      }
      const up = await ctx.http().post(api('/uploads')).set(bearer(w.travelerA)).attach('file', PNG, 'photo.png');
      expect(up.status).toBe(201);
      const imageOnly = await post(w.travelerA, { mediaUrls: [up.body.data.url] });
      expect(imageOnly.mediaUrls).toEqual([up.body.data.url]);
      expect((await call(w.travelerA, 'post', '/social/posts', { content: '   ' })).status).toBe(400);
    });

    it('the feed pages without gaps and filters by tag', async () => {
      const tag = `zamzam${uniq()}`;
      const tagged = await post(w.travelerB, { content: 'tagged', tags: [tag] });
      await post(w.travelerB, { content: 'untagged' });
      const byTag = await ok(w.travelerA, 'get', `/social/feed?tag=%23${tag}`);
      expect(byTag.items.map((x: any) => x.id)).toEqual([tagged.id]);

      const all = await ok(w.travelerA, 'get', '/social/feed?limit=100');
      const p1 = await ok(w.travelerA, 'get', '/social/feed?limit=3&page=1');
      const p2 = await ok(w.travelerA, 'get', '/social/feed?limit=3&page=2');
      expect(p1.total).toBe(all.total);
      expect([...p1.items, ...p2.items].map((x: any) => x.id)).toEqual(all.items.slice(0, 6).map((x: any) => x.id));
    });

    it('moderated posts are shown to their author only', async () => {
      const p = await post(w.travelerB, { content: `held ${uniq()}` });
      await ctx.prisma.post.update({ where: { id: p.id }, data: { moderationStatus: 'HELD_FOR_REVIEW' } });
      expect((await call(w.travelerA, 'get', `/social/posts/${p.id}`)).status).toBe(404);
      expect((await ok(w.travelerA, 'get', '/social/feed?limit=100')).items.map((x: any) => x.id)).not.toContain(p.id);
      expect((await ok(w.travelerB, 'get', `/social/posts/${p.id}`)).moderationStatus).toBe('HELD_FOR_REVIEW');
    });
  });

  describe('comments', () => {
    it('adds, pages, replies (one level), edits and deletes; counts stay right after every step', async () => {
      const p = await post(w.travelerA, { content: `Thread ${uniq()}` });
      const top: any[] = [];
      for (let i = 0; i < 12; i++) top.push(await ok(w.travelerB, 'post', `/social/posts/${p.id}/comments`, { content: `c${i}` }));
      expect(top[0]).toMatchObject({ parentId: null, isMine: true, canEdit: true, canDelete: true, replyCount: 0 });

      const page1 = await ok(w.travelerA, 'get', `/social/posts/${p.id}/comments?limit=5`);
      expect([page1.total, page1.totalPages]).toEqual([12, 3]);
      expect(page1.items.map((c: any) => c.body)).toEqual(['c11', 'c10', 'c9', 'c8', 'c7']);
      expect(page1.items[0]).toMatchObject({ isMine: false, canEdit: false, canDelete: false });
      const page3 = await ok(w.travelerA, 'get', `/social/posts/${p.id}/comments?limit=5&page=3`);
      expect(page3.items.map((c: any) => c.body)).toEqual(['c1', 'c0']);

      const reply = await ok(w.travelerA, 'post', `/social/posts/${p.id}/comments`, { content: 'r1', parentId: top[0].id });
      expect(reply.parentId).toBe(top[0].id);
      // A reply to a reply joins the same thread (one level deep).
      const nested = await ok(w.travelerB, 'post', `/social/posts/${p.id}/comments`, { content: 'r2', parentId: reply.id });
      expect(nested.parentId).toBe(top[0].id);
      const replies = await ok(w.travelerB, 'get', `/social/posts/${p.id}/comments?parentId=${top[0].id}`);
      expect(replies.items.map((c: any) => c.body)).toEqual(['r1', 'r2']);
      const topAgain = await ok(w.travelerA, 'get', `/social/posts/${p.id}/comments?limit=50`);
      expect(topAgain.total).toBe(12);
      expect(topAgain.items.find((c: any) => c.id === top[0].id).replyCount).toBe(2);
      expect((await ok(w.travelerA, 'get', `/social/posts/${p.id}`)).commentCount).toBe(14);
      expect((await ok(w.travelerB, 'get', '/social/feed?limit=100')).items.find((x: any) => x.id === p.id).commentCount).toBe(14);

      const edited = await ok(w.travelerB, 'put', `/social/posts/${p.id}/comments/${top[1].id}`, { content: 'c1 (edited)' });
      expect(edited).toMatchObject({ body: 'c1 (edited)', isMine: true });
      expect(edited.editedAt).toBeTruthy();

      // The post author may neither edit nor delete someone else's comment.
      await refused(w.travelerA, [
        ['put', `/social/posts/${p.id}/comments/${top[1].id}`, { content: 'hijacked' }],
        ['delete', `/social/posts/${p.id}/comments/${top[1].id}`],
      ]);
      await refused(w.opA, [['delete', `/social/posts/${p.id}/comments/${top[2].id}`]]);
      const untouched = await ctx.prisma.comment.findUniqueOrThrow({ where: { id: top[1].id } });
      expect([untouched.body, untouched.deletedAt]).toEqual(['c1 (edited)', null]);

      const del = await ok(w.travelerB, 'delete', `/social/posts/${p.id}/comments/${top[0].id}`);
      expect(del).toMatchObject({ deleted: true, removed: 3 });
      expect((await ok(w.travelerA, 'get', `/social/posts/${p.id}`)).commentCount).toBe(11);
      expect((await call(w.travelerB, 'get', `/social/posts/${p.id}/comments?parentId=${top[0].id}`)).status).toBe(404);
      expect((await call(w.travelerB, 'delete', `/social/posts/${p.id}/comments/${top[0].id}`)).status).toBe(404);
      const replyRow = await ctx.prisma.comment.findUniqueOrThrow({ where: { id: reply.id } });
      expect(replyRow.deletedAt).not.toBeNull();

      // Deleting a reply removes only that reply.
      const r3 = await ok(w.travelerA, 'post', `/social/posts/${p.id}/comments`, { content: 'r3', parentId: top[3].id });
      expect((await ok(w.travelerA, 'delete', `/social/posts/${p.id}/comments/${r3.id}`)).removed).toBe(1);
      expect((await ok(w.travelerA, 'get', `/social/posts/${p.id}`)).commentCount).toBe(11);

      expect((await call(w.travelerB, 'post', `/social/posts/${p.id}/comments`, { content: '   ' })).status).toBe(400);
      expect((await call(w.travelerB, 'put', `/social/posts/${p.id}/comments/${top[2].id}`, { content: '' })).status).toBe(400);
      expect((await call(w.travelerB, 'post', `/social/posts/${p.id}/comments`, { content: 'x', parentId: randomUUID() })).status).toBe(404);
      const other = await post(w.travelerB, { content: 'another post' });
      const foreign = await ok(w.travelerB, 'post', `/social/posts/${other.id}/comments`, { content: 'elsewhere' });
      expect((await call(w.travelerB, 'post', `/social/posts/${p.id}/comments`, { content: 'x', parentId: foreign.id })).status).toBe(404);
      expect((await call(w.travelerB, 'get', `/social/posts/${p.id}/comments?limit=500`)).status).toBe(400);
    });

    it('comments follow the post\'s visibility and hide moderated comments from everyone but their author', async () => {
      const hidden = await post(w.travelerA, { content: 'note to self', visibility: 'CUSTOM_SET' });
      await ok(w.travelerA, 'post', `/social/posts/${hidden.id}/comments`, { content: 'mine' });
      await refused(w.travelerB, [
        ['get', `/social/posts/${hidden.id}/comments`],
        ['post', `/social/posts/${hidden.id}/comments`, { content: 'intrusion' }],
      ]);
      expect(await ctx.prisma.comment.count({ where: { postId: hidden.id } })).toBe(1);

      const open = await post(w.travelerA, { content: `open ${uniq()}` });
      const rude = await ok(w.travelerB, 'post', `/social/posts/${open.id}/comments`, { content: 'rude' });
      await ctx.prisma.comment.update({ where: { id: rude.id }, data: { moderationStatus: 'REJECTED' } });
      expect((await ok(w.travelerA, 'get', `/social/posts/${open.id}/comments`)).items).toEqual([]);
      expect((await ok(w.travelerA, 'get', `/social/posts/${open.id}`)).commentCount).toBe(0);
      const asAuthor = await ok(w.travelerB, 'get', `/social/posts/${open.id}/comments`);
      expect(asAuthor.items.map((c: any) => [c.id, c.moderationStatus])).toEqual([[rude.id, 'REJECTED']]);
      // replying to a hidden comment is refused like an unknown one
      expect((await call(w.travelerA, 'post', `/social/posts/${open.id}/comments`, { content: 'x', parentId: rude.id })).status).toBe(404);
    });
  });

  describe('reactions and saves', () => {
    it('likes and saves toggle, persist per viewer and survive double clicks', async () => {
      const p = await post(w.travelerA, { content: `Like me ${uniq()}` });
      expect(await ok(w.travelerB, 'post', `/social/posts/${p.id}/react`, { type: 'LIKE' })).toMatchObject({ toggled: true, likeCount: 1, likedByMe: true });
      expect(await ok(w.travelerB, 'get', `/social/posts/${p.id}`)).toMatchObject({ likeCount: 1, likedByMe: true });
      expect(await ok(w.travelerA, 'get', `/social/posts/${p.id}`)).toMatchObject({ likeCount: 1, likedByMe: false });
      expect(await ok(w.travelerB, 'post', `/social/posts/${p.id}/react`, { type: 'LIKE' })).toMatchObject({ toggled: false, likeCount: 0, likedByMe: false });

      // A double-submitted "like" (desired state) lands exactly once.
      const racing = await Promise.all([1, 2].map(() => call(w.travelerB, 'post', `/social/posts/${p.id}/react`, { type: 'LIKE', active: true })));
      expect(racing.map((r) => r.status)).toEqual([201, 201]);
      expect(await ctx.prisma.reaction.count({ where: { postId: p.id, type: 'LIKE' } })).toBe(1);
      expect((await ok(w.travelerA, 'get', `/social/posts/${p.id}`)).likeCount).toBe(1);
      expect(await ok(w.travelerB, 'post', `/social/posts/${p.id}/react`, { type: 'LIKE', active: true })).toMatchObject({ likeCount: 1, likedByMe: true });
      // Plain toggles racing each other may cancel out, but never corrupt the count.
      await Promise.all([1, 2, 3].map(() => call(w.travelerB, 'post', `/social/posts/${p.id}/react`, { type: 'LIKE' })));
      const rows = await ctx.prisma.reaction.count({ where: { postId: p.id, type: 'LIKE' } });
      expect(rows).toBeLessThanOrEqual(1);
      expect((await ok(w.travelerA, 'get', `/social/posts/${p.id}`)).likeCount).toBe(rows);
      await ok(w.travelerB, 'post', `/social/posts/${p.id}/react`, { type: 'LIKE', active: true });
      expect(await ok(w.travelerB, 'post', `/social/posts/${p.id}/save`, { saved: true })).toEqual({ saved: true, saveCount: 1 });
      expect(await ok(w.travelerB, 'post', `/social/posts/${p.id}/save`, { saved: false })).toEqual({ saved: false, saveCount: 0 });

      expect(await ok(w.travelerB, 'post', `/social/posts/${p.id}/save`)).toEqual({ saved: true, saveCount: 1 });
      const saved = await ok(w.travelerB, 'get', '/social/saved-posts');
      expect(saved.find((x: any) => x.id === p.id)).toMatchObject({ savedByMe: true, likedByMe: true });
      expect((await ok(w.travelerB, 'get', '/social/feed?limit=100')).items.find((x: any) => x.id === p.id).savedByMe).toBe(true);
      expect(await ok(w.travelerB, 'post', `/social/posts/${p.id}/save`)).toEqual({ saved: false, saveCount: 0 });
      expect((await ok(w.travelerB, 'get', '/social/saved-posts')).map((x: any) => x.id)).not.toContain(p.id);

      const trending = await ok(w.travelerA, 'get', '/social/discover/trending?limit=50');
      expect(trending.find((x: any) => x.id === p.id)?.likeCount).toBe(1);
    });
  });

  describe('notifications', () => {
    it('comments, replies, likes and follows notify the right person once — never the actor', async () => {
      const p = await post(w.travelerA, { content: `Notify ${uniq()}` });
      const c = await ok(w.travelerB, 'post', `/social/posts/${p.id}/comments`, { content: 'nice' });
      let forA = (await notificationsOf(w.travelerA)).filter((n) => n.data?.postId === p.id);
      expect(forA.map((n) => [n.type, n.title, n.link])).toEqual([
        ['POST_COMMENT', 'traveler-b Fixture commented on your post', `/social?post=${p.id}`],
      ]);

      await ok(w.travelerA, 'post', `/social/posts/${p.id}/comments`, { content: 'thanks', parentId: c.id });
      const forB = (await notificationsOf(w.travelerB)).filter((n) => n.data?.postId === p.id);
      expect(forB.map((n) => n.type)).toEqual(['COMMENT_REPLY']);
      // The author replying on their own post does not notify themselves.
      expect((await notificationsOf(w.travelerA)).filter((n) => n.data?.postId === p.id)).toHaveLength(1);

      for (let i = 0; i < 3; i++) await ok(w.travelerB, 'post', `/social/posts/${p.id}/react`, { type: 'LIKE' });
      forA = (await notificationsOf(w.travelerA)).filter((n) => n.data?.postId === p.id && n.type === 'POST_REACTION');
      expect(forA).toHaveLength(1);
      expect(forA[0].title).toBe('traveler-b Fixture liked your post');

      const accountA = await ok(w.travelerA, 'get', '/social/accounts/me');
      expect((await ok(w.travelerB, 'post', `/social/accounts/${accountA.id}/follow`)).following).toBe(true);
      const follow = (await notificationsOf(w.travelerA)).find((n) => n.type === 'FOLLOW' && n.actorId === w.travelerB.id);
      expect(follow?.title).toBe('traveler-b Fixture started following you');
      await ok(w.travelerB, 'post', `/social/accounts/${accountA.id}/follow`);

      const before = await ok(w.travelerA, 'get', '/notifications?limit=1');
      expect(before.unread).toBeGreaterThan(0);
      const one = (await notificationsOf(w.travelerA)).find((n) => !n.readAt)!;
      expect((await ok(w.travelerA, 'patch', '/notifications/read', { ids: [one.id] })).updated).toBe(1);
      expect((await ctx.prisma.notification.findUniqueOrThrow({ where: { id: one.id } })).readAt).not.toBeNull();
      await ok(w.travelerA, 'post', '/notifications/read-all');
      expect((await ok(w.travelerA, 'get', '/notifications?limit=1')).unread).toBe(0);
      expect((await ok(w.travelerA, 'get', '/notifications?unreadOnly=true')).items).toEqual([]);
    });
  });

  describe('follows', () => {
    it('following reveals followers-only posts; counts are live', async () => {
      const accountA = await ok(w.travelerA, 'get', '/social/accounts/me');
      const fp = await post(w.travelerA, { content: `followers only ${uniq()}`, visibility: 'FOLLOWER_SET' });
      expect((await call(w.travelerB, 'get', `/social/posts/${fp.id}`)).status).toBe(404);
      expect(await ok(w.travelerB, 'post', `/social/accounts/${accountA.id}/follow`)).toEqual({ following: true, followerCount: 1 });
      expect((await call(w.travelerB, 'get', `/social/posts/${fp.id}`)).status).toBe(200);
      expect((await ok(w.travelerB, 'get', '/social/feed?followingOnly=true&limit=100')).items.map((x: any) => x.id)).toContain(fp.id);
      expect((await ok(w.travelerA, 'get', '/social/accounts/me'))._count.followers).toBe(1);
      expect(await ok(w.travelerB, 'post', `/social/accounts/${accountA.id}/follow`, { following: true })).toEqual({ following: true, followerCount: 1 });
      expect(await ok(w.travelerB, 'post', `/social/accounts/${accountA.id}/follow`)).toEqual({ following: false, followerCount: 0 });
      expect(await ok(w.travelerB, 'post', `/social/accounts/${accountA.id}/follow`, { following: false })).toEqual({ following: false, followerCount: 0 });
      expect((await call(w.travelerB, 'get', `/social/posts/${fp.id}`)).status).toBe(404);

      const accountB = await ok(w.travelerB, 'get', '/social/accounts/me');
      expect((await call(w.travelerB, 'post', `/social/accounts/${accountB.id}/follow`)).status).toBe(400);
      expect((await call(w.travelerB, 'post', `/social/accounts/${randomUUID()}/follow`)).status).toBe(404);
    });
  });

  describe('connections', () => {
    it('request, outgoing and incoming lists, accept, remove — with emails only where contact visibility allows', async () => {
      const [a, b] = [w.travelerA, w.travelerB];
      await ctx.prisma.connection.deleteMany({ where: { OR: [{ requesterId: a.id, recipientId: b.id }, { requesterId: b.id, recipientId: a.id }] } });
      await ok(b, 'put', '/social/accounts/me', { contactVisibility: 'CONNECTIONS' });

      const res = await call(a, 'post', '/connections/request', { recipientId: b.id, message: 'Salam' });
      expect([res.status, res.body.success]).toEqual([201, true]);
      const req = res.body.data;
      const outgoing = await ok(a, 'get', '/connections/outgoing');
      const out = outgoing.items.find((i: any) => i.recipientId === b.id);
      expect(out).toMatchObject({ connectionId: req.id, displayName: 'traveler-b Fixture', message: 'Salam' });
      expect(out.email).toBeUndefined();
      const incoming = (await ok(b, 'get', '/connections/pending')).items.find((i: any) => i.requesterId === a.id);
      expect(incoming.email).toBeUndefined();
      expect((await notificationsOf(b)).some((n) => n.type === 'CONNECTION_REQUEST' && n.data?.connectionId === req.id)).toBe(true);

      const people = await ok(a, 'get', '/social/discover/people?search=traveler-b');
      expect(people.find((p: any) => p.userId === b.id).connection).toMatchObject({ status: 'PENDING', direction: 'OUTGOING' });

      expect((await call(a, 'post', `/connections/${req.id}/accept`)).status).toBe(400);
      await refused(w.hotelA, [['post', `/connections/${req.id}/accept`]]);
      expect((await ctx.prisma.connection.findUniqueOrThrow({ where: { id: req.id } })).status).toBe('PENDING');

      await ok(b, 'post', `/connections/${req.id}/accept`);
      expect((await notificationsOf(a)).some((n) => n.type === 'CONNECTION_ACCEPTED' && n.data?.connectionId === req.id)).toBe(true);
      let mine = (await ok(a, 'get', '/connections')).items.find((i: any) => i.otherUserId === b.id);
      expect(mine.email).toBe(b.email);
      await ok(b, 'put', '/social/accounts/me', { contactVisibility: 'PRIVATE' });
      mine = (await ok(a, 'get', '/connections')).items.find((i: any) => i.otherUserId === b.id);
      expect(mine.email).toBeUndefined();
      expect(await ok(a, 'get', `/connections/status/${b.id}`)).toMatchObject({ status: 'ACCEPTED', direction: 'OUTGOING' });

      expect(await ok(a, 'delete', `/connections/with/${b.id}`)).toEqual({ removed: true });
      expect((await ok(a, 'get', '/connections')).items.map((i: any) => i.otherUserId)).not.toContain(b.id);
      expect(await ok(b, 'get', `/connections/status/${a.id}`)).toEqual({ status: 'NONE' });
      await ok(b, 'put', '/social/accounts/me', { contactVisibility: 'CONNECTIONS' });
    });
  });

  describe('messages', () => {
    it('open is idempotent and the inbox finds conversations however many others exist; reading settles notifications', async () => {
      const [a, b] = [w.travelerA, w.travelerB];
      const conv = await ok(a, 'post', '/social/conversations/open', { recipientUserId: b.id });
      expect(conv.other.displayName).toBe('traveler-b Fixture');
      await ctx.prisma.conversation.createMany({
        data: Array.from({ length: 210 }, () => ({ type: 'DM', participants: [randomUUID(), randomUUID()], lastMessageAt: new Date(Date.now() + 3_600_000) })),
      });
      expect((await ok(a, 'post', '/social/conversations/open', { recipientUserId: b.id })).id).toBe(conv.id);

      const sent = await ok(a, 'post', `/social/conversations/${conv.id}/messages`, { body: '  Salam  ' });
      expect(sent).toMatchObject({ body: 'Salam', isMine: true });
      const inboxB = await ok(b, 'get', '/social/conversations');
      const item = inboxB.items.find((c: any) => c.id === conv.id);
      expect(item.other.displayName).toBe('traveler-a Fixture');
      expect(item.latest).toMatchObject({ body: 'Salam', isMine: false });

      const unreadBefore = (await notificationsOf(b)).filter((n) => n.type === 'MESSAGE' && n.data?.conversationId === conv.id && !n.readAt);
      expect(unreadBefore).toHaveLength(1);
      expect(unreadBefore[0].link).toBe(`/messages?c=${conv.id}`);
      const thread = await ok(b, 'get', `/social/conversations/${conv.id}/messages`);
      expect(thread.items.map((m: any) => [m.body, m.isMine])).toEqual([['Salam', false]]);
      expect((await notificationsOf(b)).filter((n) => n.type === 'MESSAGE' && n.data?.conversationId === conv.id && !n.readAt)).toHaveLength(0);

      await refused(w.hotelA, [
        ['get', `/social/conversations/${conv.id}/messages`],
        ['post', `/social/conversations/${conv.id}/messages`, { body: 'intrusion' }],
      ]);
      expect(await ctx.prisma.message.count({ where: { conversationId: conv.id } })).toBe(1);
      expect((await call(a, 'post', `/social/conversations/${conv.id}/messages`, { body: '   ' })).status).toBe(400);
    });

    it('a block stops direct messages in both directions', async () => {
      // A pair no other suite uses: the isolation suite asserts the exact messages of travelerA↔hotelA.
      const [a, h] = [w.travelerB, w.transportA];
      const conv = await ok(a, 'post', '/social/conversations/open', { recipientUserId: h.id });
      await ok(a, 'post', `/social/conversations/${conv.id}/messages`, { body: 'before the block' });
      await ctx.prisma.connection.deleteMany({ where: { OR: [{ requesterId: a.id, recipientId: h.id }, { requesterId: h.id, recipientId: a.id }] } });
      const block = await ctx.prisma.connection.create({ data: { requesterId: h.id, recipientId: a.id, status: 'BLOCKED' } });
      try {
        expect((await call(a, 'post', '/social/conversations/open', { recipientUserId: h.id })).status).toBe(404);
        expect((await call(a, 'post', `/social/conversations/${conv.id}/messages`, { body: 'x' })).status).toBe(403);
        expect((await call(h, 'post', `/social/conversations/${conv.id}/messages`, { body: 'y' })).status).toBe(403);
        expect(await ctx.prisma.message.count({ where: { conversationId: conv.id } })).toBe(1);
        const people = await ok(a, 'get', '/social/discover/people?search=manager');
        expect(people.find((p: any) => p.userId === h.id)?.connection).toEqual({ status: 'UNAVAILABLE' });
      } finally {
        await ctx.prisma.connection.delete({ where: { id: block.id } });
      }
    });
  });
});
