import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  LOCALES,
  NOTIFICATION_CATEGORIES,
  buildPreferencesUpdate,
  draftFrom,
  formatInTimeZone,
  timeZoneOptions,
  type UserPreferences,
} from '../lib/preferences';

const API = join(__dirname, '..', '..', '..', 'platform', 'api', 'src', 'modules');
const read = (file: string) => readFileSync(join(API, file), 'utf8');

const saved: UserPreferences = {
  locale: 'en',
  timezone: 'Asia/Riyadh',
  notifications: { inApp: Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, true])) as UserPreferences['notifications']['inApp'] },
  enforcement: { inApp: false },
  options: { locales: ['en', 'ar'], notificationCategories: [...NOTIFICATION_CATEGORIES] },
};

const prefsState = vi.hoisted(() => ({ data: null as any }));
vi.mock('../hooks/use-auth', () => ({
  usePreferences: () => ({ data: prefsState.data, isLoading: false, error: null, refetch: vi.fn() }),
  useUpdatePreferences: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}));
import { PreferencesSection } from '../components/settings/preferences-section';

describe('preferences contract with the API', () => {
  it('offers exactly the notification categories the server catalogue defines', () => {
    const catalog = read('preferences/preferences.catalog.ts');
    const body = catalog.match(/export const NOTIFICATION_CATEGORIES = \{([\s\S]*?)\} as const/)![1];
    const serverKeys = [...body.matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1]);
    expect([...NOTIFICATION_CATEGORIES]).toEqual(serverKeys);
  });

  it('offers exactly the languages the server accepts', () => {
    const emails = read('auth/auth-emails.ts');
    const serverLocales = [...emails.match(/EMAIL_LOCALES = \[([^\]]*)\]/)![1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect([...LOCALES]).toEqual(serverLocales);
  });

  it('only ever sends fields the update DTO declares (the server rejects unknown ones)', () => {
    const dto = read('preferences/dto/update-preferences.dto.ts');
    const declared = (cls: string) => {
      const block = dto.match(new RegExp(`export class ${cls} \\{([\\s\\S]*?)\\n\\}`))![1];
      return [...block.matchAll(/^\s*(?:@[^\n]*\s)*\s*([a-zA-Z]+)\?:/gm)].map((m) => m[1]);
    };
    const draft = { locale: 'ar' as const, timezone: 'Asia/Jakarta', inApp: { ...saved.notifications.inApp, community: false, visa: false } };
    const update = buildPreferencesUpdate(saved, draft)!;
    expect(Object.keys(update).every((k) => declared('UpdatePreferencesDto').includes(k))).toBe(true);
    expect(Object.keys(update.notifications!)).toEqual(['inApp']);
    expect(Object.keys(update.notifications!.inApp).every((k) => declared('InAppNotificationPreferencesDto').includes(k))).toBe(true);
    expect(update).toEqual({ locale: 'ar', timezone: 'Asia/Jakarta', notifications: { inApp: { community: false, visa: false } } });
  });

  it('sends nothing when nothing changed, and never echoes read-only fields', () => {
    expect(buildPreferencesUpdate(saved, draftFrom(saved))).toBeNull();
    const update = buildPreferencesUpdate(saved, { ...draftFrom(saved), timezone: 'Europe/London' });
    expect(update).toEqual({ timezone: 'Europe/London' });
    expect(update).not.toHaveProperty('enforcement');
    expect(update).not.toHaveProperty('options');
  });

  it('formats times in the saved zone and keeps an unusual saved zone selectable', () => {
    expect(formatInTimeZone('2026-09-18T12:00:00.000Z', 'Asia/Riyadh')).toMatch(/^18 Sept? 2026, 15:00$/);
    expect(formatInTimeZone('2026-09-18T12:00:00.000Z', 'Asia/Jakarta')).toMatch(/^18 Sept? 2026, 19:00$/);
    expect(timeZoneOptions('Etc/GMT-3')[0]).toBe('Etc/GMT-3');
  });
});

describe('preferences form', () => {
  it('does not show notification switches the server does not honour', () => {
    prefsState.data = saved;
    const html = renderToStaticMarkup(<PreferencesSection />);
    expect(html).toContain('Email language');
    expect(html).toContain('Time zone');
    expect(html).toContain('not available on this deployment yet');
    expect(html).not.toContain('role="switch"');
  });

  it('shows one switch per category once the notification service enforces them', () => {
    prefsState.data = { ...saved, enforcement: { inApp: true }, notifications: { inApp: { ...saved.notifications.inApp, bookings: false } } };
    const html = renderToStaticMarkup(<PreferencesSection />);
    expect(html.match(/role="switch"/g)).toHaveLength(NOTIFICATION_CATEGORIES.length);
    expect(html).toContain('Bookings and payments');
    expect(html).toMatch(/aria-checked="false"/);
  });
});
