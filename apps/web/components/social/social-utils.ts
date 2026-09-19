/**
 * Pure helpers for the social screens (no React), kept here so they can be
 * unit-tested and shared by the hub, the post card and the comment thread.
 */

export type PostVisibility = 'PUBLIC' | 'FOLLOWER_SET' | 'VERIFIED_ONLY' | 'ROLE_SET' | 'CUSTOM_SET';

/** Post kinds the composer offers (all accepted by the API's PostType enum). */
export const POST_TYPES = [
  { type: 'UPDATE', label: 'Update' },
  { type: 'QUESTION', label: 'Question' },
  { type: 'GUIDELINE', label: 'Tip' },
  { type: 'STORY', label: 'Experience' },
  { type: 'OFFER', label: 'Offer' },
] as const;

export const POST_TYPE_LABELS: Record<string, string> = {
  UPDATE: 'Update',
  QUESTION: 'Question',
  GUIDELINE: 'Tip',
  STORY: 'Experience',
  OFFER: 'Offer',
  EVENT: 'Event',
  PARTNERSHIP: 'Partnership',
};

/** Every audience the server enforces (PostVisibility), in plain words. */
export const AUDIENCES: { value: PostVisibility; label: string; description: string }[] = [
  { value: 'PUBLIC', label: 'Everyone', description: 'Anyone signed in to Umrah Connect' },
  { value: 'FOLLOWER_SET', label: 'Followers', description: 'Only people who follow you' },
  { value: 'VERIFIED_ONLY', label: 'Verified accounts', description: 'Only accounts with a verified badge' },
  { value: 'ROLE_SET', label: 'Selected account types', description: 'Only the account types you choose' },
  { value: 'CUSTOM_SET', label: 'Only me', description: 'A private note visible to you alone' },
];

/** Role codes a role-targeted post can reach (ROLE_SET), with their product names. */
export const AUDIENCE_ROLES = [
  { code: 'PILGRIM', label: 'Travelers' },
  { code: 'OPERATOR_ADMIN', label: 'Operator admins' },
  { code: 'OPERATOR_STAFF', label: 'Operator staff' },
  { code: 'HOTEL_MANAGER', label: 'Hotels' },
  { code: 'TRANSPORT_MANAGER', label: 'Transport' },
  { code: 'VISA_OFFICER', label: 'Visa officers' },
] as const;

export function audienceLabel(visibility?: string): string {
  return AUDIENCES.find((a) => a.value === visibility)?.label ?? 'Everyone';
}

/** Largest number of photos one post may carry in the composer. */
export const MAX_POST_PHOTOS = 4;
export const MAX_POST_LENGTH = 2000;
export const MAX_COMMENT_LENGTH = 1000;

/**
 * Hashtags written in the text become the post's tags (lower-cased, unique, at
 * most 20, each up to 50 characters — the server's limits). Latin, digits,
 * underscore, dash and Arabic letters are recognised.
 */
export function extractHashtags(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/#([A-Za-z0-9_؀-ۿ-]{1,50})/g)) {
    found.add(match[1].toLowerCase());
    if (found.size === 20) break;
  }
  return [...found];
}

export function formatTimeAgo(value: string | Date | undefined | null, now: number = Date.now()): string {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '';
  const seconds = Math.max(0, (now - time) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Date(time).toLocaleDateString();
}

export function initialsOf(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return letters || 'U';
}

/** The in-app link that opens one post with its comments (also used by notifications). */
export function postLink(postId: string): string {
  return `/social?post=${postId}`;
}

/** Pages of a paginated list can overlap when new rows arrive between loads; show each row once. */
export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

/** "1 comment" / "3 comments". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
