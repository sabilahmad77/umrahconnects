import { ConflictException } from '@nestjs/common';

/*
 * Visa application workflow. The server is authoritative; the web client
 * mirrors VISA_TRANSITIONS (apps/web/tests/server-contracts.test.ts compares
 * the two tables) so it only offers moves the server accepts.
 */

/** Which status may follow which. */
export const VISA_TRANSITIONS: Record<string, string[]> = {
  NOT_STARTED: ['DOCUMENTS_COLLECTING', 'SUBMITTED', 'CANCELLED'],
  DOCUMENTS_COLLECTING: ['NOT_STARTED', 'SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['DOCUMENTS_COLLECTING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['DOCUMENTS_COLLECTING', 'APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['EXPIRED', 'CANCELLED'],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

/**
 * Statuses the plain edit may move an application to. Submitting, approving,
 * rejecting and cancelling have their own actions, which check readiness,
 * capture the visa number / reason and notify the filer.
 */
export const VISA_EDIT_STATUSES = ['NOT_STARTED', 'DOCUMENTS_COLLECTING', 'UNDER_REVIEW', 'EXPIRED'];

/** Closed applications keep their history: only the notes may still change. */
export const VISA_TERMINAL_STATUSES = ['REJECTED', 'EXPIRED', 'CANCELLED'];

/** Document states that stop an application from being submitted. */
export const BLOCKING_DOCUMENT_STATUSES = ['MISSING', 'REJECTED', 'EXPIRED'];

export function assertVisaTransition(from: string, to: string) {
  const allowed = VISA_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ConflictException(
      allowed.length
        ? `A ${from.replace(/_/g, ' ')} application can move to ${allowed.map((s) => s.replace(/_/g, ' ')).join(', ')} — not ${to.replace(/_/g, ' ')}`
        : `A ${from.replace(/_/g, ' ')} application is closed and cannot change status`,
    );
  }
}

