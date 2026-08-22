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

// ── Visa service requests (support tickets) ──────────────────────────────
// Mirrors VisaRequestStatus / VisaRequestPriority / VisaRequestCategory in
// platform/api/prisma/schema.prisma.

export const VISA_REQUEST_STATUSES = [
  'OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'ESCALATED', 'RESOLVED', 'CLOSED',
] as const;
export type VisaRequestStatus = typeof VISA_REQUEST_STATUSES[number];

/** Statuses the plain status control may set — the rest have dedicated actions. */
export const VISA_REQUEST_WORKFLOW_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER'] as const;

/** A ticket is "live" (and can go overdue) in these states. */
export const VISA_REQUEST_OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'ESCALATED'] as const;

export const VISA_REQUEST_STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  OPEN:                { label: 'Open',        color: 'bg-blue-100 text-blue-700',      dot: 'bg-blue-500' },
  IN_PROGRESS:         { label: 'In Progress', color: 'bg-indigo-100 text-indigo-700',  dot: 'bg-indigo-500' },
  WAITING_ON_CUSTOMER: { label: 'Waiting',     color: 'bg-yellow-100 text-yellow-700',  dot: 'bg-yellow-500' },
  ESCALATED:           { label: 'Escalated',   color: 'bg-red-100 text-red-600',        dot: 'bg-red-500' },
  RESOLVED:            { label: 'Resolved',    color: 'bg-green-100 text-green-700',    dot: 'bg-green-500' },
  CLOSED:              { label: 'Closed',      color: 'bg-gray-100 text-gray-600',      dot: 'bg-gray-400' },
};

export const VISA_REQUEST_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type VisaRequestPriority = typeof VISA_REQUEST_PRIORITIES[number];

export const VISA_REQUEST_PRIORITY_META: Record<string, { label: string; color: string }> = {
  LOW:    { label: 'Low',    color: 'bg-gray-100 text-gray-600' },
  NORMAL: { label: 'Normal', color: 'bg-blue-50 text-blue-700' },
  HIGH:   { label: 'High',   color: 'bg-orange-100 text-orange-700' },
  URGENT: { label: 'Urgent', color: 'bg-red-100 text-red-600' },
};

export const VISA_REQUEST_CATEGORIES = [
  'NEW_APPLICATION', 'DOCUMENT_ISSUE', 'STATUS_INQUIRY', 'URGENT_PROCESSING',
  'APPOINTMENT', 'CORRECTION', 'REFUND', 'CANCELLATION', 'OTHER',
] as const;
export type VisaRequestCategory = typeof VISA_REQUEST_CATEGORIES[number];

export const VISA_REQUEST_NOTE_VISIBILITIES = ['INTERNAL', 'PUBLIC'] as const;

// ── Platform administration (Super Admin) ────────────────────────────────
// These MUST mirror the TenantStatus / UserStatus enums in schema.prisma.
// The admin UI previously offered TENANT 'INACTIVE' and USER 'SUSPENDED',
// neither of which exists in the database — picking either 500'd the request.

export const TENANT_STATUSES = [
  'PENDING_KYC', 'KYC_SUBMITTED', 'KYC_APPROVED', 'KYC_REJECTED',
  'ACTIVE', 'SUSPENDED', 'CHURNED',
] as const;
export type TenantStatus = typeof TENANT_STATUSES[number];

export const TENANT_STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  PENDING_KYC:   { label: 'Pending KYC',   color: 'bg-gray-100 text-gray-600',      dot: 'bg-gray-400' },
  KYC_SUBMITTED: { label: 'KYC Submitted', color: 'bg-blue-100 text-blue-700',      dot: 'bg-blue-500' },
  KYC_APPROVED:  { label: 'KYC Approved',  color: 'bg-teal-100 text-teal-700',      dot: 'bg-teal-500' },
  KYC_REJECTED:  { label: 'KYC Rejected',  color: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-500' },
  ACTIVE:        { label: 'Active',        color: 'bg-green-100 text-green-700',    dot: 'bg-green-500' },
  SUSPENDED:     { label: 'Suspended',     color: 'bg-red-100 text-red-600',        dot: 'bg-red-500' },
  CHURNED:       { label: 'Archived',      color: 'bg-gray-100 text-gray-600',      dot: 'bg-gray-400' },
};

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED', 'PENDING_VERIFICATION'] as const;
export type UserStatus = typeof USER_STATUSES[number];

export const USER_STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  ACTIVE:               { label: 'Active',   color: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  INACTIVE:             { label: 'Inactive', color: 'bg-gray-100 text-gray-600',     dot: 'bg-gray-400' },
  LOCKED:               { label: 'Locked',   color: 'bg-red-100 text-red-600',       dot: 'bg-red-500' },
  PENDING_VERIFICATION: { label: 'Pending',  color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
};

/** Tenant states that block sign-in (the auth guard rejects non-ACTIVE tenants). */
export const TENANT_BLOCKING_STATUSES = TENANT_STATUSES.filter((s) => s !== 'ACTIVE');

// ── Visa documents ───────────────────────────────────────────────────────
// Mirrors VisaDocumentStatus in schema.prisma. EXPIRED is derived from
// expiresAt by the API (`effectiveStatus`) rather than stored, so a document
// never sits at "verified" past its expiry date.
export const VISA_DOCUMENT_STATUSES = ['MISSING', 'RECEIVED', 'VERIFIED', 'REJECTED', 'EXPIRED'] as const;
export type VisaDocumentStatus = typeof VISA_DOCUMENT_STATUSES[number];

export const VISA_DOCUMENT_STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  MISSING:  { label: 'Missing',  color: 'bg-gray-100 text-gray-600',      dot: 'bg-gray-400' },
  RECEIVED: { label: 'Received', color: 'bg-blue-100 text-blue-700',      dot: 'bg-blue-500' },
  VERIFIED: { label: 'Verified', color: 'bg-green-100 text-green-700',    dot: 'bg-green-500' },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-600',        dot: 'bg-red-500' },
  EXPIRED:  { label: 'Expired',  color: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-500' },
};

/** Statuses an operator may set directly; VERIFIED/REJECTED need a decision route. */
export const VISA_DOCUMENT_EDITABLE_STATUSES = ['MISSING', 'RECEIVED'] as const;

export const VISA_DOCUMENT_TYPES = [
  'PASSPORT', 'PHOTO', 'VACCINATION', 'ID_CARD', 'BIRTH_CERTIFICATE',
  'MARRIAGE_CERTIFICATE', 'MAHRAM_PROOF', 'BANK_STATEMENT', 'OTHER',
] as const;
