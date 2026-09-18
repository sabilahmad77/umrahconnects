import { describe, expect, it } from 'vitest';
import {
  audienceLabel,
  dedupeById,
  extractHashtags,
  formatTimeAgo,
  initialsOf,
  plural,
  postLink,
} from '../components/social/social-utils';
import { safeNotificationLink } from '../hooks/use-platform';

describe('social helpers', () => {
  it('turns #hashtags into lower-case, unique tags within the server limits', () => {
    expect(extractHashtags('Arrived! #Umrah #makkah #UMRAH and #zam-zam_2026')).toEqual(['umrah', 'makkah', 'zam-zam_2026']);
    expect(extractHashtags('no tags here # alone')).toEqual([]);
    expect(extractHashtags('#مكة المكرمة')).toEqual(['مكة']);
    const many = Array.from({ length: 30 }, (_, i) => `#t${i}`).join(' ');
    expect(extractHashtags(many)).toHaveLength(20);
    expect(extractHashtags(`#${'a'.repeat(60)}`)[0]).toHaveLength(50);
  });

  it('formats relative times and tolerates missing or invalid dates', () => {
    const now = Date.parse('2026-09-18T12:00:00Z');
    expect(formatTimeAgo('2026-09-18T11:59:30Z', now)).toBe('Just now');
    expect(formatTimeAgo('2026-09-18T11:15:00Z', now)).toBe('45m ago');
    expect(formatTimeAgo('2026-09-18T07:00:00Z', now)).toBe('5h ago');
    expect(formatTimeAgo('2026-09-16T12:00:00Z', now)).toBe('2d ago');
    expect(formatTimeAgo(undefined, now)).toBe('');
    expect(formatTimeAgo('not a date', now)).toBe('');
  });

  it('shows each paginated row once even when pages overlap', () => {
    expect(dedupeById([{ id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'c' }]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('labels audiences, initials, counts and post links', () => {
    expect(audienceLabel('CUSTOM_SET')).toBe('Only me');
    expect(audienceLabel('FOLLOWER_SET')).toBe('Followers');
    expect(audienceLabel(undefined)).toBe('Everyone');
    expect(initialsOf('Yusuf Traveler')).toBe('YT');
    expect(initialsOf('')).toBe('U');
    expect(plural(1, 'comment')).toBe('1 comment');
    expect(plural(3, 'reply', 'replies')).toBe('3 replies');
    expect(postLink('p1')).toBe('/social?post=p1');
  });
});

describe('notification links', () => {
  it('follows in-app paths only', () => {
    expect(safeNotificationLink('/social?post=1')).toBe('/social?post=1');
    expect(safeNotificationLink('/messages?c=2')).toBe('/messages?c=2');
    for (const bad of ['https://evil.test', '//evil.test/x', '/\\evil.test', 'javascript:alert(1)', '', null, undefined]) {
      expect(safeNotificationLink(bad as any), String(bad)).toBeNull();
    }
  });
});
