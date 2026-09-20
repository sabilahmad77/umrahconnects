import { describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import {
  HOTEL_BOOKING_INITIAL_STATUSES, HOTEL_BOOKING_TERMINAL_STATUSES, HOTEL_BOOKING_TRANSITIONS, ROOM_MANUAL_STATUSES,
  assertHotelBookingTransition, staysOverlap,
} from './hotel-workflow';
import { HOTEL_BOOKING_STATUSES, ROOM_STATUSES } from './dto/hotel.dto';

describe('hotel booking workflow', () => {
  it('covers every booking status and only points at real statuses', () => {
    expect(Object.keys(HOTEL_BOOKING_TRANSITIONS).sort()).toEqual([...HOTEL_BOOKING_STATUSES].sort());
    for (const targets of Object.values(HOTEL_BOOKING_TRANSITIONS)) {
      for (const t of targets) expect(HOTEL_BOOKING_STATUSES).toContain(t);
    }
  });

  it('closed bookings go nowhere and new bookings start before check-in', () => {
    for (const s of HOTEL_BOOKING_TERMINAL_STATUSES) expect(HOTEL_BOOKING_TRANSITIONS[s]).toEqual([]);
    expect(HOTEL_BOOKING_INITIAL_STATUSES).toEqual(['PENDING', 'CONFIRMED']);
  });

  it('refuses skipping the desk steps', () => {
    expect(() => assertHotelBookingTransition('PENDING', 'CHECKED_IN')).toThrow(ConflictException);
    expect(() => assertHotelBookingTransition('CHECKED_IN', 'CANCELLED')).toThrow(ConflictException);
    expect(() => assertHotelBookingTransition('COMPLETED', 'PENDING')).toThrow(/closed/);
    expect(() => assertHotelBookingTransition('CONFIRMED', 'CHECKED_IN')).not.toThrow();
    expect(() => assertHotelBookingTransition('PENDING', 'PENDING')).not.toThrow();
  });

  it('never lets a form set room occupancy', () => {
    expect(ROOM_MANUAL_STATUSES).not.toContain('OCCUPIED');
    for (const s of ROOM_MANUAL_STATUSES) expect(ROOM_STATUSES).toContain(s);
  });

  it('treats the check-out day as free for the next guest', () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    expect(staysOverlap(d('2026-10-01'), d('2026-10-03'), d('2026-10-03'), d('2026-10-05'))).toBe(false);
    expect(staysOverlap(d('2026-10-01'), d('2026-10-04'), d('2026-10-03'), d('2026-10-05'))).toBe(true);
  });
});
