// FIX-04: single source of truth for status vocabularies on the web.
// These MUST mirror the Prisma enums in platform/api/prisma/schema.prisma.
// If the backend enums change, update here (and the API DTOs) together.

export const PILGRIM_STATUSES = [
  'LEAD', 'PROSPECT', 'BOOKED', 'DOCUMENTS_PENDING', 'VISA_PENDING',
  'VISA_APPROVED', 'VISA_REJECTED', 'TRAVELING', 'IN_KINGDOM', 'RETURNED', 'CANCELLED',
] as const;
export type PilgrimStatus = typeof PILGRIM_STATUSES[number];

// "In Kingdom" active-journey definition — shared by dashboard tile AND CRM filter
// so counts agree (FIX-07). Matches reports.service.getOverview().
export const PILGRIM_ACTIVE_STATUSES = ['BOOKED', 'VISA_PENDING', 'VISA_APPROVED', 'TRAVELING', 'IN_KINGDOM'] as const;

export const INVOICE_STATUSES = [
  'DRAFT', 'ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID',
] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];

// Display metadata (label + Tailwind classes) for every invoice state — every
// backend state is now representable in the UI.
export const INVOICE_STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  DRAFT:          { label: 'Draft',    color: 'bg-gray-100 text-gray-600',      dot: 'bg-gray-400' },
  ISSUED:         { label: 'Issued',   color: 'bg-blue-100 text-blue-700',      dot: 'bg-blue-500' },
  SENT:           { label: 'Sent',     color: 'bg-indigo-100 text-indigo-700',  dot: 'bg-indigo-500' },
  PARTIALLY_PAID: { label: 'Partial',  color: 'bg-yellow-100 text-yellow-700',  dot: 'bg-yellow-500' },
  PAID:           { label: 'Paid',     color: 'bg-green-100 text-green-700',     dot: 'bg-green-500' },
  OVERDUE:        { label: 'Overdue',  color: 'bg-red-100 text-red-600',         dot: 'bg-red-500' },
  CANCELLED:      { label: 'Cancelled',color: 'bg-gray-100 text-gray-500',       dot: 'bg-gray-300' },
  VOID:           { label: 'Void',     color: 'bg-gray-100 text-gray-500',       dot: 'bg-gray-300' },
};

// Human label for any status token (Title Case from SNAKE_CASE)
export const humanizeStatus = (s?: string) =>
  (s ?? '').split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
