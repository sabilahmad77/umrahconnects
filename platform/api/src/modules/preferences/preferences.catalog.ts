import type { NotificationType } from '@prisma/client';

/**
 * Notification categories a person can switch off for the in-app feed.
 *
 * Each category lists the NotificationType values that NotificationsService
 * actually fires today, so every switch maps to real notifications. SYSTEM is
 * deliberately absent: account and platform notices are always delivered.
 *
 * There is no email channel: notifications are only delivered in-app, and the
 * only emails the platform sends (verification, password reset) are account
 * security messages that cannot be opted out of.
 */
export const NOTIFICATION_CATEGORIES = {
  community: ['POST_COMMENT', 'COMMENT_REPLY', 'POST_REACTION', 'FOLLOW'],
  connections: ['CONNECTION_REQUEST', 'CONNECTION_ACCEPTED'],
  messages: ['MESSAGE'],
  groups: ['GROUP_INVITE'],
  requests: ['REQUEST_OFFER', 'REQUEST_OFFER_ACCEPTED', 'REQUEST_OFFER_REJECTED'],
  bookings: ['BOOKING_CREATED', 'BOOKING_STATUS', 'PAYMENT_RECEIVED'],
  visa: ['VISA_STATUS', 'VISA_REQUEST'],
} as const satisfies Record<string, readonly NotificationType[]>;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;

export const NOTIFICATION_CATEGORY_KEYS = Object.keys(NOTIFICATION_CATEGORIES) as NotificationCategory[];

export function categoryOf(type: string): NotificationCategory | undefined {
  return NOTIFICATION_CATEGORY_KEYS.find((key) => (NOTIFICATION_CATEGORIES[key] as readonly string[]).includes(type));
}
