import { createHash, randomBytes } from 'crypto';
import type { PilgrimLinkStatus } from '@prisma/client';

/**
 * Rules shared by the organization side (invite / resend / revoke) and the
 * traveler side (preview / accept / decline / unlink) of a traveler ↔ pilgrim
 * link. See DECISIONS.md D-022.
 */

/** An invitation is answerable for seven days after it was (re)sent. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimum gap between two emails for the same invitation (mail-bombing guard). */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/** 256-bit opaque token for the emailed link. Only its hash is ever stored. */
export function newInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Tokens arrive from a browser; anything that cannot be one of ours is refused
 * before it reaches the database (43 base64url characters for 32 bytes).
 */
export function isWellFormedInvitationToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Emails are compared case-insensitively and without surrounding space. */
export function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * The status a link has *now*. An invitation past its expiry is EXPIRED even
 * before anything has written that to the row (expiry is applied lazily).
 */
export function effectiveLinkStatus(
  link: { status: PilgrimLinkStatus; expiresAt: Date },
  now: Date = new Date(),
): PilgrimLinkStatus {
  if (link.status === 'INVITED' && link.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return link.status;
}

/** Display name for a person record: "First Last", trimmed, never empty. */
export function displayName(first?: string | null, last?: string | null, fallback = 'Traveler'): string {
  const name = [first, last].map((part) => String(part ?? '').trim()).filter(Boolean).join(' ');
  return name || fallback;
}

export interface InvitationMailInput {
  organizationName: string;
  link: string;
  expiresAt: Date;
}

/**
 * The invitation email. It names the inviting organization so the recipient can
 * judge it, but not the traveler record: if the address on file is wrong, a
 * stranger learns nothing about whose trip it is.
 */
export function buildInvitationMail({ organizationName, link, expiresAt }: InvitationMailInput) {
  const until = expiresAt.toISOString().slice(0, 10);
  return {
    subject: `${organizationName} invited you to follow your trip on Umrah Connect`,
    text:
      `Assalamu alaikum,\n\n` +
      `${organizationName} manages your trip on Umrah Connect and has invited you to link your ` +
      `traveler account, so you can follow your booking, group and visa status yourself.\n\n` +
      `Open this link and sign in with the Umrah Connect account that uses this email address. ` +
      `The address must be verified on your account. The link works once and expires on ${until}:\n` +
      `${link}\n\n` +
      `If you accept, ${organizationName} will see your account name and this email address. ` +
      `You can unlink at any time from "My travel plan".\n\n` +
      `If you were not expecting this invitation, ignore this email. Nothing is linked unless you accept.\n`,
  };
}
