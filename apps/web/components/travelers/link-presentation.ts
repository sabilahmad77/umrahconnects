import type { AccountLinkStatus, OrganizationAccountLink } from '@/hooks/use-traveler-links';

/**
 * Pure presentation rules for traveler ↔ pilgrim links (P06, D-022), kept free
 * of React and network code so they can be unit-tested directly.
 */

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

export const LINK_STATUS_META: Record<AccountLinkStatus, { label: string; tone: BadgeTone }> = {
  INVITED: { label: 'Invitation sent', tone: 'warning' },
  ACTIVE: { label: 'Linked', tone: 'success' },
  DECLINED: { label: 'Declined', tone: 'neutral' },
  REVOKED: { label: 'Access revoked', tone: 'danger' },
  UNLINKED: { label: 'Unlinked by traveler', tone: 'neutral' },
  EXPIRED: { label: 'Invitation expired', tone: 'neutral' },
};

export function linkStatusMeta(status: string) {
  return LINK_STATUS_META[status as AccountLinkStatus] ?? { label: status, tone: 'neutral' as BadgeTone };
}

/** The link that currently matters: an active link, else an open or expired invitation. */
export function currentAccountLink(links: OrganizationAccountLink[] | undefined): OrganizationAccountLink | null {
  if (!links?.length) return null;
  return (
    links.find((l) => l.status === 'ACTIVE') ??
    links.find((l) => l.status === 'INVITED') ??
    null
  );
}

const TRIP_TONES: Record<string, BadgeTone> = {
  // Visa
  APPROVED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'danger',
  CANCELLED: 'danger',
  SUBMITTED: 'warning',
  UNDER_REVIEW: 'warning',
  DOCUMENTS_COLLECTING: 'warning',
  NOT_STARTED: 'neutral',
  // Booking
  CONFIRMED: 'success',
  PARTIALLY_PAID: 'warning',
  FULLY_PAID: 'success',
  VISA_PROCESSING: 'warning',
  TRAVELING: 'success',
  COMPLETED: 'success',
  REFUNDED: 'neutral',
  DRAFT: 'neutral',
  // Traveler record
  VISA_APPROVED: 'success',
  VISA_REJECTED: 'danger',
  VISA_PENDING: 'warning',
  DOCUMENTS_PENDING: 'warning',
  BOOKED: 'success',
  IN_KINGDOM: 'success',
};

export function tripStatusTone(status: string | null | undefined): BadgeTone {
  return TRIP_TONES[String(status ?? '')] ?? 'neutral';
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatDateRange(from: string | null | undefined, to: string | null | undefined): string | null {
  if (!from && !to) return null;
  return `${formatDate(from)} → ${formatDate(to)}`;
}

export type InvitationProblem = {
  title: string;
  body: string;
  action?: 'verify-email' | 'switch-account' | 'travel-plan';
};

/** Maps the API's invitation error codes to what the traveler can do next. */
export function invitationProblem(code: string | undefined, message: string | undefined): InvitationProblem {
  switch (code) {
    case 'INVITATION_INVALID':
      return {
        title: 'This invitation link cannot be used',
        body: message ?? 'It may have expired, been used already or been withdrawn. Ask your travel organizer to send a new one.',
        action: 'travel-plan',
      };
    case 'EMAIL_NOT_VERIFIED':
      return {
        title: 'Verify your email address first',
        body:
          'Only a verified email address can accept a trip invitation. Confirm your email from the message we sent ' +
          'you, then open the invitation link again.',
        action: 'verify-email',
      };
    case 'INVITATION_EMAIL_MISMATCH':
      return {
        title: 'This invitation is for a different email address',
        body:
          'Sign out, then sign in with the Umrah Connect account that uses the address the invitation was sent to, ' +
          'and open the link again.',
        action: 'switch-account',
      };
    case 'TRAVELER_ACCOUNT_REQUIRED':
      return {
        title: 'Traveler account required',
        body: 'Trip invitations are answered from a traveler account. Sign in with your traveler account and open the link again.',
        action: 'switch-account',
      };
    default:
      return {
        title: 'Unable to open this invitation',
        body: message ?? 'Try again. If the problem continues, contact your travel organizer.',
      };
  }
}

/** The invitation token from a URL query string (`?token=…`), if present. */
export function readInvitationToken(search: string): string {
  try {
    return (new URLSearchParams(search).get('token') ?? '').trim();
  } catch {
    return '';
  }
}
