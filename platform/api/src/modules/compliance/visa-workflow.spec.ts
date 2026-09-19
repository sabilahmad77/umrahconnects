import { describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { VisaStatus } from '@prisma/client';
import { VISA_EDIT_STATUSES, VISA_TERMINAL_STATUSES, VISA_TRANSITIONS, assertVisaTransition } from './visa-workflow';

describe('visa application workflow', () => {
  it('covers every VisaStatus and only points at real statuses', () => {
    expect(Object.keys(VISA_TRANSITIONS).sort()).toEqual(Object.values(VisaStatus).sort());
    for (const targets of Object.values(VISA_TRANSITIONS)) {
      for (const t of targets) expect(Object.values(VisaStatus)).toContain(t);
    }
    for (const s of VISA_TERMINAL_STATUSES) expect(VISA_TRANSITIONS[s]).toEqual([]);
  });

  it('decisions only follow a submission', () => {
    for (const from of ['NOT_STARTED', 'DOCUMENTS_COLLECTING', 'APPROVED']) {
      expect(() => assertVisaTransition(from, 'APPROVED')).toThrow(ConflictException);
      expect(() => assertVisaTransition(from, 'REJECTED')).toThrow(ConflictException);
    }
    expect(() => assertVisaTransition('SUBMITTED', 'APPROVED')).not.toThrow();
    expect(() => assertVisaTransition('UNDER_REVIEW', 'REJECTED')).not.toThrow();
    expect(() => assertVisaTransition('REJECTED', 'SUBMITTED')).toThrow(/closed/);
  });

  it('the plain edit never reaches a decision or a submission', () => {
    for (const s of ['APPROVED', 'REJECTED', 'SUBMITTED', 'CANCELLED']) expect(VISA_EDIT_STATUSES).not.toContain(s);
  });
});
