import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  currentAccountLink,
  formatDate,
  invitationProblem,
  linkStatusMeta,
  readInvitationToken,
  tripStatusTone,
} from '../components/travelers/link-presentation';
import { AccountAccessHistory, AccountAccessStatus } from '../components/pilgrims/pilgrim-account-access';
import { LinkedTripsEmpty, TripCard } from '../components/travelers/linked-trips';
import { InvitationDetails } from '../components/travelers/invitation-response';
import type { OrganizationAccountLink, TravelerTrip } from '../hooks/use-traveler-links';

const noop = () => {};
const link = (over: Partial<OrganizationAccountLink>): OrganizationAccountLink => ({
  id: 'l1', status: 'INVITED', invitedEmail: 'amina@qa.test', emailSource: 'RECORD', invitedAt: '2026-09-18T10:00:00Z',
  expiresAt: '2026-09-25T10:00:00Z', lastSentAt: '2026-09-18T10:00:00Z', sendCount: 1, invitedBy: { id: 's', name: 'Sara Staff' },
  acceptedAt: null, declinedAt: null, unlinkedAt: null, revokedAt: null, revokedBy: null, revokedReason: null, account: null, ...over,
});

describe('traveler link presentation rules (P06)', () => {
  it('picks the link that matters: active first, then an open invitation, never a finished one', () => {
    expect(currentAccountLink([])).toBeNull();
    expect(currentAccountLink([link({ id: 'a', status: 'REVOKED' }), link({ id: 'b', status: 'EXPIRED' })])).toBeNull();
    expect(currentAccountLink([link({ id: 'a', status: 'INVITED' }), link({ id: 'b', status: 'ACTIVE' })])?.id).toBe('b');
    expect(currentAccountLink([link({ id: 'a', status: 'DECLINED' }), link({ id: 'b', status: 'INVITED' })])?.id).toBe('b');
  });

  it('labels every link status and tones trip statuses by meaning', () => {
    for (const s of ['INVITED', 'ACTIVE', 'DECLINED', 'REVOKED', 'UNLINKED', 'EXPIRED']) expect(linkStatusMeta(s).label).not.toBe(s);
    expect(tripStatusTone('APPROVED')).toBe('success');
    expect(tripStatusTone('REJECTED')).toBe('danger');
    expect(tripStatusTone('SUBMITTED')).toBe('warning');
    expect(tripStatusTone('SOMETHING_NEW')).toBe('neutral');
  });

  it('never invents a date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not a date')).toBe('—');
    expect(formatDate('2026-10-01T00:00:00Z')).toBe('1 Oct 2026');
  });

  it('turns each invitation error code into a next step for the traveler', () => {
    expect(invitationProblem('EMAIL_NOT_VERIFIED', 'x').action).toBe('verify-email');
    expect(invitationProblem('INVITATION_EMAIL_MISMATCH', 'x').action).toBe('switch-account');
    expect(invitationProblem('TRAVELER_ACCOUNT_REQUIRED', 'x').action).toBe('switch-account');
    expect(invitationProblem('INVITATION_INVALID', 'Server says no').body).toBe('Server says no');
    expect(invitationProblem(undefined, undefined).title).toMatch(/Unable/);
  });

  it('reads the token from the query string only', () => {
    expect(readInvitationToken('?token=abc_DEF-123')).toBe('abc_DEF-123');
    expect(readInvitationToken('')).toBe('');
    expect(readInvitationToken('?other=1')).toBe('');
  });
});

describe('organization view of traveler access', () => {
  it('offers the invite action only to staff who may manage the record', () => {
    expect(renderToStaticMarkup(<AccountAccessStatus link={null} canManage onInvite={noop} onResend={noop} onRevoke={noop} />)).toContain('Invite traveler');
    const readOnly = renderToStaticMarkup(<AccountAccessStatus link={null} canManage={false} onInvite={noop} onResend={noop} onRevoke={noop} />);
    expect(readOnly).toContain('Not linked to a traveler account');
    expect(readOnly).not.toContain('<button');
  });

  it('shows who is linked and offers revocation; an open invitation offers resend and withdraw', () => {
    const active = renderToStaticMarkup(<AccountAccessStatus link={link({ status: 'ACTIVE', acceptedAt: '2026-09-19T00:00:00Z', account: { id: 'u', name: 'Amina Rahman', email: 'amina@qa.test' } })} canManage onInvite={noop} onResend={noop} onRevoke={noop} />);
    expect(active).toContain('Linked to Amina Rahman');
    expect(active).toContain('Revoke access');
    const invited = renderToStaticMarkup(<AccountAccessStatus link={link({ sendCount: 2 })} canManage busy onInvite={noop} onResend={noop} onRevoke={noop} />);
    expect(invited).toContain('Sent to amina@qa.test');
    expect(invited).toContain('sent 2 times');
    expect(invited).toContain('Resend');
    expect(invited).toContain('Withdraw');
    expect(invited.match(/disabled=""/g)?.length).toBe(2); // no duplicate submissions while busy
  });

  it('records reasons, entered addresses and every ending in the history', () => {
    const html = renderToStaticMarkup(<AccountAccessHistory links={[
      link({ id: '1', status: 'REVOKED', revokedAt: '2026-09-20T00:00:00Z', revokedBy: { id: 's', name: 'Sara Staff' }, revokedReason: 'Booking moved' }),
      link({ id: '2', status: 'UNLINKED', unlinkedAt: '2026-09-20T00:00:00Z', emailSource: 'ENTERED' }),
      link({ id: '3', status: 'EXPIRED' }),
    ]} />);
    expect(html).toContain('Booking moved');
    expect(html).toContain('entered by staff');
    expect(html).toContain('Unlinked by the traveler');
    expect(html).toContain('without an answer');
    expect(renderToStaticMarkup(<AccountAccessHistory links={[]} />)).toContain('No invitations have been sent');
  });
});

describe('traveler view of linked trips', () => {
  const trip: TravelerTrip = {
    linkId: 'l1', linkedAt: '2026-09-19T00:00:00Z', organization: { name: 'Al-Noor Umrah Services' },
    traveler: { name: 'Amina Rahman', status: 'VISA_PENDING' },
    bookings: [{ bookingRef: 'QA-2026-A0001', status: 'CONFIRMED', departureDate: '2026-10-01', returnDate: '2026-10-15', package: { name: 'Autumn Umrah 14 nights', tripType: 'UMRAH', durationDays: 14 }, group: { name: 'October group A', status: 'PLANNING', departureDate: null, returnDate: null } }],
    visas: [{ status: 'SUBMITTED', visaType: 'UMRAH', submittedAt: '2026-09-20T00:00:00Z', decidedAt: null, validUntil: null, updatedAt: '2026-09-20T00:00:00Z' }],
  };

  it('labels each trip with the organization and shows booking, group and visa status', () => {
    const html = renderToStaticMarkup(<TripCard trip={trip} onUnlink={noop} />);
    // Month abbreviations differ between ICU versions ("Sep" / "Sept"), so dates are matched by day and year.
    for (const text of ['Al-Noor Umrah Services', 'Amina Rahman', 'Visa Pending', 'QA-2026-A0001', 'Confirmed', 'October group A', 'Submitted 20 ', 'Unlink']) {
      expect(html, text).toContain(text);
    }
  });

  it('says plainly when nothing has been recorded yet', () => {
    const html = renderToStaticMarkup(<TripCard trip={{ ...trip, bookings: [], visas: [] }} onUnlink={noop} />);
    expect(html).toContain('No booking has been recorded for you yet.');
    expect(html).toContain('No visa application has been started for you yet.');
  });

  it('explains linking honestly before any link exists', () => {
    const html = renderToStaticMarkup(<LinkedTripsEmpty />);
    expect(html).toContain('No trips are linked to your account yet');
    expect(html).toContain('must be verified');
    expect(html).toContain('Nothing is linked automatically');
  });

  it('tells the traveler what accepting shares before they accept', () => {
    const html = renderToStaticMarkup(<InvitationDetails details={{ organization: { name: 'Al-Noor Umrah Services' }, traveler: { name: 'Amina Rahman' }, expiresAt: '2026-09-25T00:00:00Z' }} onAccept={noop} onDecline={noop} />);
    expect(html).toContain('From Al-Noor Umrah Services');
    expect(html).toContain('Follow the trip of Amina Rahman');
    expect(html).toContain('your name and email address');
    expect(html).toContain('Accept and link my account');
    expect(html).toContain('Decline');
  });
});
