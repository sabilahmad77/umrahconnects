import { describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  ASSIGNMENT_INITIAL_STATUSES, ASSIGNMENT_TERMINAL_STATUSES, DRIVER_MANUAL_STATUSES, OPEN_ASSIGNMENT_STATUSES,
  ROUTE_MANUAL_STATUSES, TRANSPORT_ASSIGNMENT_TRANSITIONS, VEHICLE_MANUAL_STATUSES,
  assertAssignmentTransition, assertManualStatus, tripsOverlap,
} from './transport-workflow';
import { ASSIGNMENT_STATUSES, DRIVER_STATUSES, ROUTE_STATUSES, VEHICLE_STATUSES } from './dto/transport.dto';

describe('transport trip workflow', () => {
  it('covers every trip status and only points at real statuses', () => {
    expect(Object.keys(TRANSPORT_ASSIGNMENT_TRANSITIONS).sort()).toEqual([...ASSIGNMENT_STATUSES].sort());
    for (const targets of Object.values(TRANSPORT_ASSIGNMENT_TRANSITIONS)) {
      for (const t of targets) expect(ASSIGNMENT_STATUSES).toContain(t);
    }
    for (const s of ASSIGNMENT_TERMINAL_STATUSES) expect(TRANSPORT_ASSIGNMENT_TRANSITIONS[s]).toEqual([]);
    for (const s of ASSIGNMENT_INITIAL_STATUSES) expect(OPEN_ASSIGNMENT_STATUSES).toContain(s);
  });

  it('a trip departs before it completes and cannot be cancelled once under way', () => {
    expect(() => assertAssignmentTransition('SCHEDULED', 'COMPLETED')).toThrow(ConflictException);
    expect(() => assertAssignmentTransition('IN_PROGRESS', 'CANCELLED')).toThrow(ConflictException);
    expect(() => assertAssignmentTransition('CANCELLED', 'SCHEDULED')).toThrow(/closed/);
    expect(() => assertAssignmentTransition('CONFIRMED', 'IN_PROGRESS')).not.toThrow();
  });

  it('derived statuses are never typed in', () => {
    expect(VEHICLE_MANUAL_STATUSES).not.toContain('IN_SERVICE');
    expect(DRIVER_MANUAL_STATUSES).not.toContain('ON_TRIP');
    expect(ROUTE_MANUAL_STATUSES).not.toContain('FULLY_BOOKED');
    for (const s of VEHICLE_MANUAL_STATUSES) expect(VEHICLE_STATUSES).toContain(s);
    for (const s of DRIVER_MANUAL_STATUSES) expect(DRIVER_STATUSES).toContain(s);
    for (const s of ROUTE_MANUAL_STATUSES) expect(ROUTE_STATUSES).toContain(s);
    expect(() => assertManualStatus('vehicle', 'IN_SERVICE', VEHICLE_MANUAL_STATUSES, 'x')).toThrow(BadRequestException);
    expect(() => assertManualStatus('vehicle', undefined, VEHICLE_MANUAL_STATUSES, 'x')).not.toThrow();
  });

  it('trip windows overlap only while both are running', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 1, h));
    expect(tripsOverlap(at(10), 60, at(11), 60)).toBe(false);
    expect(tripsOverlap(at(10), 90, at(11), 60)).toBe(true);
  });
});
