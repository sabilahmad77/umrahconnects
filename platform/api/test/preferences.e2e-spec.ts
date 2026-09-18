import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { bearer, buildWorld, PASSWORD, World } from './fixtures';
import { PreferencesService } from '../src/modules/preferences/preferences.service';
import { NOTIFICATION_CATEGORY_KEYS } from '../src/modules/preferences/preferences.catalog';

/** Persisted user preferences (P07 / XT-005): owner-only, strict validation, honoured server-side. */
describe('user preferences', () => {
  let ctx: TestContext;
  let w: World;

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  const get = (token: string) => ctx.http().get(api('/users/me/preferences')).set('Authorization', `Bearer ${token}`);
  const put = (token: string, body: unknown) =>
    ctx.http().put(api('/users/me/preferences')).set('Authorization', `Bearer ${token}`).send(body as object);

  it('returns defaults for a person who never saved anything', async () => {
    const res = await get(w.travelerB.token);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      locale: 'en',
      timezone: 'Asia/Riyadh',
      notifications: { inApp: Object.fromEntries(NOTIFICATION_CATEGORY_KEYS.map((k) => [k, true])) },
      enforcement: { inApp: false },
      options: { locales: ['en', 'ar'], notificationCategories: NOTIFICATION_CATEGORY_KEYS },
    });
  });

  it('the owner updates part of it; the saved values come back now, on a new read and after a fresh sign-in', async () => {
    const saved = await put(w.travelerA.token, { locale: 'ar', timezone: 'Asia/Jakarta', notifications: { inApp: { community: false, bookings: false } } });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ locale: 'ar', timezone: 'Asia/Jakarta' });
    expect(saved.body.data.notifications.inApp).toMatchObject({ community: false, bookings: false, messages: true });

    // Partial: a later change of one field keeps the others.
    const partial = await put(w.travelerA.token, { notifications: { inApp: { bookings: true } } });
    expect(partial.body.data).toMatchObject({ locale: 'ar', timezone: 'Asia/Jakarta' });
    expect(partial.body.data.notifications.inApp).toMatchObject({ community: false, bookings: true });

    const login = await ctx.http().post(api('/auth/login')).send({ email: w.travelerA.email, password: PASSWORD });
    const fresh = await get(login.body.data.accessToken);
    expect(fresh.body.data).toMatchObject({ locale: 'ar', timezone: 'Asia/Jakarta', notifications: { inApp: { community: false, bookings: true } } });
    const me = await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(me.body.data).toMatchObject({ locale: 'ar', timezone: 'Asia/Jakarta' });
  });

  it('is owner-only: nobody can read or change another person’s preferences', async () => {
    await put(w.opA.token, { timezone: 'Europe/London', notifications: { inApp: { visa: false } } });
    const other = await get(w.opB.token);
    expect(other.body.data.timezone).not.toBe('Europe/London');
    expect(other.body.data.notifications.inApp.visa).toBe(true);

    expect((await put(w.opB.token, { userId: w.opA.id, timezone: 'Asia/Tokyo' })).status).toBe(400);
    expect((await ctx.http().get(api(`/users/${w.opA.id}/preferences`)).set(bearer(w.opB))).status).toBe(404);
    expect((await ctx.http().put(api(`/users/${w.opA.id}/preferences`)).set(bearer(w.opB)).send({ timezone: 'Asia/Tokyo' })).status).toBe(404);
    expect((await get(w.opA.token)).body.data.timezone).toBe('Europe/London');

    expect((await ctx.http().get(api('/users/me/preferences'))).status).toBe(401);
    expect((await ctx.http().put(api('/users/me/preferences')).send({ timezone: 'Asia/Tokyo' })).status).toBe(401);
  });

  it.each([
    ['an unknown top-level field', { theme: 'dark' }],
    ['an unknown channel', { notifications: { email: { community: false } } }],
    ['an unknown category', { notifications: { inApp: { system: false } } }],
    ['a language the product does not offer', { locale: 'fr' }],
    ['a string instead of a boolean', { notifications: { inApp: { community: 'false' } } }],
    ['an unknown time zone', { timezone: 'Mars/Olympus_Mons' }],
  ])('rejects %s with 400 and changes nothing', async (_label, body) => {
    const before = (await get(w.staffA.token)).body.data;
    const res = await put(w.staffA.token, body);
    expect(res.status).toBe(400);
    expect((await get(w.staffA.token)).body.data).toEqual(before);
  });

  it('the in-app gate honours a switched-off category and never mutes system notices', async () => {
    const prefs = ctx.app.get(PreferencesService);
    await put(w.hotelA.token, { notifications: { inApp: { community: false } } });
    expect(await prefs.allowsInApp(w.hotelA.id, 'POST_COMMENT')).toBe(false);
    expect(await prefs.allowsInApp(w.hotelA.id, 'COMMENT_REPLY')).toBe(false);
    expect(await prefs.allowsInApp(w.hotelA.id, 'BOOKING_STATUS')).toBe(true);
    expect(await prefs.allowsInApp(w.hotelA.id, 'SYSTEM')).toBe(true);
    expect(await prefs.allowsInApp(w.hotelB.id, 'POST_COMMENT')).toBe(true);

    await put(w.hotelA.token, { notifications: { inApp: { community: true } } });
    expect(await prefs.allowsInApp(w.hotelA.id, 'POST_COMMENT')).toBe(true);
    const row = await ctx.prisma.userPreference.findUniqueOrThrow({ where: { userId: w.hotelA.id } });
    expect(row.notifications).toEqual({ inApp: {} });
  });

  it('language and time zone are honoured in the account emails the server sends', async () => {
    await put(w.transportA.token, { locale: 'ar', timezone: 'Asia/Jakarta' });
    ctx.mails.length = 0;
    await ctx.http().post(api('/auth/forgot-password')).send({ email: w.transportA.email });
    const arabic = ctx.mails.find((m) => m.to === w.transportA.email)!;
    expect(arabic.subject).toBe('إعادة تعيين كلمة المرور في Umrah Connect');
    expect(arabic.text).toContain('(Asia/Jakarta)');

    await put(w.transportA.token, { locale: 'en', timezone: 'Europe/London' });
    ctx.mails.length = 0;
    await ctx.http().post(api('/auth/forgot-password')).send({ email: w.transportA.email });
    const english = ctx.mails.find((m) => m.to === w.transportA.email)!;
    expect(english.subject).toBe('Reset your Umrah Connect password');
    expect(english.text).toContain('(Europe/London)');
  });
});
