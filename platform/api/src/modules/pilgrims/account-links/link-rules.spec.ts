import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import {
  INVITATION_TTL_MS,
  buildInvitationMail,
  displayName,
  effectiveLinkStatus,
  hashInvitationToken,
  isWellFormedInvitationToken,
  newInvitationToken,
  normalizeEmail,
} from './link-rules';

describe('traveler link rules', () => {
  it('mints 256-bit url-safe tokens that are never equal to their stored hash', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newInvitationToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(isWellFormedInvitationToken(token)).toBe(true);
      const hash = hashInvitationToken(token);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
      expect(hash).not.toContain(token);
    }
  });

  it('refuses anything that cannot be one of our tokens before it reaches the database', () => {
    for (const bad of [undefined, null, 42, '', 'short', 'x'.repeat(44), `${'a'.repeat(42)}=`, `${'a'.repeat(42)}/`, { token: 'a' }]) {
      expect(isWellFormedInvitationToken(bad)).toBe(false);
    }
  });

  it('compares emails case-insensitively and ignores surrounding space', () => {
    expect(normalizeEmail('  Traveler.A@Example.TEST ')).toBe('traveler.a@example.test');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });

  it('treats an unanswered invitation past its expiry as EXPIRED without touching other states', () => {
    const now = new Date('2026-09-18T12:00:00Z');
    const past = new Date(now.getTime() - 1);
    const future = new Date(now.getTime() + INVITATION_TTL_MS);
    expect(effectiveLinkStatus({ status: 'INVITED', expiresAt: future }, now)).toBe('INVITED');
    expect(effectiveLinkStatus({ status: 'INVITED', expiresAt: past }, now)).toBe('EXPIRED');
    expect(effectiveLinkStatus({ status: 'INVITED', expiresAt: now }, now)).toBe('EXPIRED');
    for (const status of ['ACTIVE', 'DECLINED', 'REVOKED', 'UNLINKED', 'EXPIRED'] as const) {
      expect(effectiveLinkStatus({ status, expiresAt: past }, now)).toBe(status);
    }
  });

  it('builds display names without inventing data', () => {
    expect(displayName(' Amina ', 'Rahman')).toBe('Amina Rahman');
    expect(displayName('', null)).toBe('Traveler');
    expect(displayName(undefined, undefined, 'Staff member')).toBe('Staff member');
  });

  it('names the inviting organization but not the traveler record in the email', () => {
    const mail = buildInvitationMail({
      organizationName: 'Al-Noor Umrah Services',
      link: 'https://app.test/travel-plan/link?token=abc',
      expiresAt: new Date('2026-09-25T10:00:00Z'),
    });
    expect(mail.subject).toContain('Al-Noor Umrah Services');
    expect(mail.text).toContain('https://app.test/travel-plan/link?token=abc');
    expect(mail.text).toContain('2026-09-25');
    expect(mail.text).toMatch(/must be verified/i);
    expect(mail.text).toMatch(/Nothing is linked unless you accept/);
  });
});
