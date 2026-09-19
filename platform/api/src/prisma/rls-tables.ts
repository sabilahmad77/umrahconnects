import type { Prisma } from '@prisma/client';

/**
 * Row-Level Security classification of EVERY table (R05, docs/control-tower/RLS.md).
 *
 * The migration `20260918180000_rls_defence_in_depth` creates the policies; the
 * Prisma extension (rls-extension.ts) scopes every query that can reach one of
 * these tables; `test/rls.e2e-spec.ts` fails if the database and this list
 * disagree, or if a table exists that is in neither list — a new table cannot
 * silently miss its decision.
 *
 * Policy kinds (all FORCE ROW LEVEL SECURITY; `system` scope may read and write):
 *  - tenant        rows of `tenant_id = app.tenant_id` in `tenant` scope.
 *  - shared-hotel  as `tenant`, plus rows with `tenant_id IS NULL` (shared marketplace
 *                  hotels) readable by any signed-in scope; only `system` writes them.
 *  - owner-user    rows of `user_id = app.user_id` (the signed-in user's own).
 *  - child         no tenant column: visible/writable when the parent row is visible
 *                  (the parent's own policy decides).
 * `platformRead` adds read-only access in `platform` scope (Super Admin oversight);
 * `platformWrite` lets platform administration write too (KYC review).
 */
export type RlsPolicyKind = 'tenant' | 'shared-hotel' | 'owner-user' | 'child';

export interface ProtectedTable {
  table: string;
  model: Prisma.ModelName;
  policy: RlsPolicyKind;
  /** For `child`: the parent table and the column that references its id. */
  parent?: { table: string; column: string };
  platformRead?: boolean;
  platformWrite?: boolean;
}

export const RLS_PROTECTED_TABLES: readonly ProtectedTable[] = [
  // CRM — pilgrim records are the most sensitive data an organization holds.
  { table: 'plugin_crm.pilgrims', model: 'Pilgrim', policy: 'tenant', platformRead: true },
  { table: 'plugin_crm.pilgrim_documents', model: 'PilgrimDocument', policy: 'tenant' },
  { table: 'plugin_crm.family_groups', model: 'FamilyGroup', policy: 'tenant' },
  { table: 'plugin_crm.pilgrim_account_links', model: 'PilgrimAccountLink', policy: 'tenant' },
  // Bookings
  { table: 'plugin_booking.packages', model: 'Package', policy: 'tenant', platformRead: true },
  { table: 'plugin_booking.bookings', model: 'Booking', policy: 'tenant', platformRead: true },
  { table: 'plugin_booking.booking_pilgrims', model: 'BookingPilgrim', policy: 'tenant' },
  // Visa
  { table: 'plugin_visa.visa_applications', model: 'VisaApplication', policy: 'tenant', platformRead: true },
  { table: 'plugin_visa.visa_documents', model: 'VisaDocument', policy: 'tenant' },
  {
    table: 'plugin_visa.visa_document_versions', model: 'VisaDocumentVersion', policy: 'child',
    parent: { table: 'plugin_visa.visa_documents', column: 'document_id' },
  },
  { table: 'plugin_visa.regulatory_submissions', model: 'RegulatorySubmission', policy: 'tenant' },
  { table: 'plugin_visa.visa_service_requests', model: 'VisaServiceRequest', policy: 'tenant' },
  {
    table: 'plugin_visa.visa_service_request_notes', model: 'VisaServiceRequestNote', policy: 'child',
    parent: { table: 'plugin_visa.visa_service_requests', column: 'request_id' },
  },
  {
    table: 'plugin_visa.visa_service_request_events', model: 'VisaServiceRequestEvent', policy: 'child',
    parent: { table: 'plugin_visa.visa_service_requests', column: 'request_id' },
  },
  // Finance
  { table: 'plugin_finance.invoices', model: 'Invoice', policy: 'tenant', platformRead: true },
  { table: 'plugin_finance.payments', model: 'Payment', policy: 'tenant', platformRead: true },
  { table: 'plugin_finance.payment_transactions', model: 'PaymentTransaction', policy: 'tenant' },
  { table: 'plugin_finance.payment_webhook_events', model: 'PaymentWebhookEvent', policy: 'tenant' },
  { table: 'plugin_finance.payment_customers', model: 'PaymentCustomer', policy: 'owner-user' },
  { table: 'plugin_finance.budget_plans', model: 'BudgetPlan', policy: 'tenant' },
  { table: 'plugin_finance.ledger_entries', model: 'LedgerEntry', policy: 'tenant' },
  // Transport
  { table: 'plugin_transport.vehicles', model: 'Vehicle', policy: 'tenant', platformRead: true },
  { table: 'plugin_transport.drivers', model: 'Driver', policy: 'tenant' },
  {
    table: 'plugin_transport.vehicle_drivers', model: 'VehicleDriver', policy: 'child',
    parent: { table: 'plugin_transport.vehicles', column: 'vehicle_id' },
  },
  { table: 'plugin_transport.transport_routes', model: 'TransportRoute', policy: 'tenant' },
  { table: 'plugin_transport.transport_assignments', model: 'TransportAssignment', policy: 'tenant' },
  { table: 'plugin_transport.tasreeh_permits', model: 'TasreehPermit', policy: 'tenant' },
  // Hotels — shared marketplace hotels have no organization (tenant_id IS NULL).
  { table: 'plugin_hotel.hotels', model: 'Hotel', policy: 'shared-hotel', platformRead: true },
  {
    table: 'plugin_hotel.room_types', model: 'RoomType', policy: 'child',
    parent: { table: 'plugin_hotel.hotels', column: 'hotel_id' },
  },
  { table: 'plugin_hotel.rooms', model: 'Room', policy: 'tenant' },
  { table: 'plugin_hotel.hotel_bookings', model: 'HotelBooking', policy: 'tenant' },
  { table: 'plugin_hotel.allotments', model: 'Allotment', policy: 'tenant' },
  { table: 'plugin_hotel.room_assignments', model: 'RoomAssignment', policy: 'tenant' },
  // Group operations — incidents are operator-internal (groups themselves are shared, below).
  { table: 'plugin_group_ops.incidents', model: 'Incident', policy: 'tenant' },
  // Organization verification: the organization itself, and platform KYC review.
  { table: 'core.tenant_kyc', model: 'TenantKyc', policy: 'tenant', platformRead: true, platformWrite: true },
  // Per-user settings.
  { table: 'core.user_preferences', model: 'UserPreference', policy: 'owner-user' },
];

/**
 * Tables deliberately left without RLS, with the reason. Isolation for them stays
 * in the service layer (principal-derived tenant, ownership helpers, e2e attacks).
 */
export const RLS_UNPROTECTED_TABLES: Readonly<Record<string, string>> = {
  // Identity and access control: read before any principal exists (login, refresh,
  // token validation on every request) and across organizations by platform admin.
  'core.tenants': 'Identity substrate: resolved before a principal exists (login, slug lookup, token validation) and listed by platform admin; holds no tenant-private business data.',
  'core.users': 'Identity substrate: read on every request by token validation and before a principal exists (login, reset, Google); author/profile names are shown across organizations (social, groups). Secret columns are never serialized (e2e secret scan).',
  'core.media_objects': 'Upload registry (A06): public-media metadata only (URL, type, size, checksum, original name) — no tenant-private content. Attach and delete check ownership in the service; travelers own uploads without an organization scope; the orphan-cleanup job reads every row in system scope.',
  'core.refresh_tokens': 'Session substrate: looked up by token hash before a principal exists (refresh/logout); never listed.',
  'core.user_identities': 'Session substrate: external identities resolved during Google sign-in before a principal exists.',
  'core.otp_codes': 'Session substrate: one-time codes verified before a principal exists.',
  'core.roles': 'Access-control catalogue: system roles (tenant_id NULL) are shared by every organization and read by the permission guard on every request.',
  'core.permissions': 'Access-control catalogue shared by every organization.',
  'core.role_permissions': 'Access-control catalogue shared by every organization.',
  'core.user_roles': 'Read by the permission guard on every request before any business query; grants are validated in the service layer.',
  'core.tenant_plugins': 'Plugin installation flags read by the plugin host; no business data.',
  'core.public_inquiries': 'Write-only public contact form; read only by platform administration.',
  'audit.audit_logs': 'Append-only trail written from every flow, including pre-authentication ones (login, webhooks) and traveler actions logged against an operator; reads are capability-gated and tenant-filtered. Insert-only RLS needs the writer to stop using INSERT … RETURNING (follow-up).',
  'plugin_finance.fx_rates': 'Global reference data (exchange rates); no tenant data.',
  // Shared by design across organizations: public groups that travelers join.
  'plugin_group_ops.trip_groups': 'Public groups: travelers of the community organization discover and join operator groups; membership decides access (service layer).',
  'plugin_group_ops.group_members': 'Membership of shared groups spans organizations (operator staff + community travelers).',
  'plugin_group_ops.group_invites': 'Invitations into shared groups span organizations.',
  'plugin_group_ops.group_posts': 'Group feed shared by members of different organizations; membership-checked in the service.',
  'plugin_group_ops.group_post_comments': 'Group feed shared by members of different organizations.',
  'plugin_group_ops.group_polls': 'Group feed shared by members of different organizations.',
  'plugin_group_ops.group_poll_votes': 'Group feed shared by members of different organizations.',
  'plugin_group_ops.group_notes': 'Group notes shared by members of different organizations.',
  'plugin_group_ops.group_documents': 'Group documents shared by members of different organizations; downloads are authorized per member.',
  // Marketplace: public catalogue and two-party records between a customer and a provider.
  'marketplace.vendors': 'Public marketplace catalogue (published vendors are readable without signing in).',
  'marketplace.listings': 'Public marketplace catalogue (published listings are readable without signing in).',
  'marketplace.listing_inquiries': 'Two-party record (customer ↔ provider organization); both sides resolved in the service.',
  'marketplace.listing_bookings': 'Two-party record (traveler ↔ provider organization); both sides resolved in the service.',
  'marketplace.quotes': 'Two-party record (requesting organization ↔ vendor).',
  'marketplace.vendor_ratings': 'Published ratings of a vendor are public.',
  'marketplace.marketplace_requests': 'Open traveler requests are visible to every provider by design; owner checks in the service.',
  'marketplace.request_offers': 'Two-party record (provider offer ↔ traveler request).',
  // Community social content: travelers share one organization, so a tenant policy
  // cannot separate them; privacy is per user and enforced in the service.
  'social.social_accounts': 'Community profile data, per user (no tenant dimension).',
  'social.posts': 'Community content, public to signed-in members.',
  'social.comments': 'Community content, public to signed-in members.',
  'social.reactions': 'Community content, public to signed-in members.',
  'social.saved_posts': 'Per-user bookmarks of community content (service-layer owner check).',
  'social.follows': 'Community graph, public to signed-in members.',
  'social.connections': 'Per-user connection requests (service-layer participant check).',
  'social.conversations': 'Direct messages: participant-private, enforced in the service (per-user policy is a follow-up).',
  'social.messages': 'Direct messages: participant-private, enforced in the service (per-user policy is a follow-up).',
  'social.post_reports': 'Moderation reports, read by platform moderation.',
  'social.notifications': 'Per-user inbox written by OTHER users’ actions (fan-out); per-user policy needs a system-scoped writer (follow-up).',
};

export const RLS_MODELS: ReadonlySet<string> = new Set(RLS_PROTECTED_TABLES.map((t) => t.model));
