/**
 * Account preferences (P07): the contract of `GET/PUT /users/me/preferences`
 * (platform/api/src/modules/preferences). The server rejects unknown fields,
 * so updates are built only from the fields below.
 */

export const NOTIFICATION_CATEGORIES = ['community', 'connections', 'messages', 'groups', 'requests', 'bookings', 'visa'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const LOCALES = ['en', 'ar'] as const;
export type PreferenceLocale = (typeof LOCALES)[number];

export interface UserPreferences {
  locale: PreferenceLocale;
  timezone: string;
  notifications: { inApp: Record<NotificationCategory, boolean> };
  /** Whether the notification service honours the in-app switches on this deployment. */
  enforcement: { inApp: boolean };
  options: { locales: string[]; notificationCategories: string[] };
}

export interface PreferencesUpdate {
  locale?: PreferenceLocale;
  timezone?: string;
  notifications?: { inApp: Partial<Record<NotificationCategory, boolean>> };
}

export interface PreferencesDraft {
  locale: PreferenceLocale;
  timezone: string;
  inApp: Record<NotificationCategory, boolean>;
}

export const LOCALE_LABELS: Record<PreferenceLocale, string> = {
  en: 'English',
  ar: 'العربية (Arabic)',
};

export const CATEGORY_LABELS: Record<NotificationCategory, { label: string; description: string }> = {
  community: { label: 'Community activity', description: 'Comments, replies and reactions on your posts.' },
  connections: { label: 'Connections', description: 'Connection requests and accepted requests.' },
  messages: { label: 'Messages', description: 'New direct messages.' },
  groups: { label: 'Groups', description: 'Invitations to join a group.' },
  requests: { label: 'Requests and offers', description: 'Marketplace inquiries, offers and their decisions.' },
  bookings: { label: 'Bookings and payments', description: 'New bookings, booking status changes and received payments.' },
  visa: { label: 'Visa updates', description: 'Visa requests and status changes.' },
};

export function draftFrom(saved: UserPreferences): PreferencesDraft {
  return { locale: saved.locale, timezone: saved.timezone, inApp: { ...saved.notifications.inApp } };
}

/** Only what changed, and only fields the server accepts. Null when there is nothing to save. */
export function buildPreferencesUpdate(saved: UserPreferences, draft: PreferencesDraft): PreferencesUpdate | null {
  const update: PreferencesUpdate = {};
  if (draft.locale !== saved.locale && (LOCALES as readonly string[]).includes(draft.locale)) update.locale = draft.locale;
  if (draft.timezone !== saved.timezone) update.timezone = draft.timezone;
  const inApp: Partial<Record<NotificationCategory, boolean>> = {};
  for (const category of NOTIFICATION_CATEGORIES) {
    const next = draft.inApp[category];
    if (typeof next === 'boolean' && next !== saved.notifications.inApp[category]) inApp[category] = next;
  }
  if (Object.keys(inApp).length) update.notifications = { inApp };
  return Object.keys(update).length ? update : null;
}

/** Every IANA zone the browser knows, with the saved one kept even if the list is unavailable. */
export function timeZoneOptions(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  if (!zones.length) zones = ['Asia/Riyadh', 'Asia/Jakarta', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Kuala_Lumpur', 'Asia/Dubai', 'Africa/Cairo', 'Europe/Istanbul', 'Europe/London', 'America/New_York', 'UTC'];
  return zones.includes(current) ? zones : [current, ...zones];
}

export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** A date and time shown in the person's saved time zone, e.g. "18 Sep 2026, 15:45". */
export function formatInTimeZone(value: string | Date, timeZone: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
}
