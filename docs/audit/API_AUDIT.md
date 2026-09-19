# API Audit

> **Render references here are RETIRED (2026-09-19).** Render (`umrah-connect-api.onrender.com`, `render.yaml`) is retired
> from the target architecture (API → Hostinger KVM 8). This historical record is kept unchanged as evidence; current
> state and the remaining owner steps: `docs/control-tower/RENDER_RETIREMENT.md`.

Audited 2026-09-17 against the running API (`http://localhost:4100/api/v1`, NestJS 10, global prefix `/api/v1`).
The inventory below was parsed from every `*.controller.ts` and cross-checked against the routes the running
process actually mapped at boot: **304 parsed = 304 mapped, zero mismatches.**

## Summary

| | |
|---|---|
| Total routes | **304** |
| By method | GET 132 · POST 92 · PUT 51 · PATCH 3 · DELETE 26 |
| Public (no auth) | 19 |
| JWT + permission | 246 |
| JWT only (no permission check) | 39 |
| Controllers | 23 |
| Response envelope | `{"success": true, "data": …}`; errors `{"success": false, "error": {code, message, requestId, timestamp}}` (a few controllers — connections, marketplace-requests, notifications — return bare objects) |
| Auth | Bearer JWT (`Authorization` header only), issuer `umrah-connects`, audience `umrah-connects-api`; `TenantContextMiddleware` rejects tokens whose tenant is not `ACTIVE` |
| Guards | global `JwtAuthGuard` + `PermissionsGuard`; **no `ThrottlerGuard`** (AUD-007) |

## Runtime verification performed

| Check | Result |
|---|---|
| Every parameterless GET (85) as operator | **84 × 200**, 1 × 403 (`/tenants/me/sub-agents`, AUD-016). **Zero 5xx.** |
| Same 85 GETs anonymously | 401 except 5 intentionally public (`/health`, `/health/ready`, `/groups/public`, `/marketplace/listings`, `/marketplace/vendors`) |
| Detail routes with a real id | 200 for all 26 list-backed detail routes that had data |
| Detail routes with a random UUID | 404 everywhere (except `/connections/status/:userId`, which returns a NONE status — by design) |
| Detail routes with a malformed id | 400 everywhere (`ParseUUIDPipe`) |
| Cross-tenant by-id reads (Kaaba → Al Haramain) | 404 for pilgrims, bookings, invoices, payments, vehicles, visas, visa-requests, packages, groups · **200 for hotels (AUD-003)** |
| Cross-tenant write | pilgrims 404 · **hotels 200 (AUD-003)** |
| Platform admin as a tenant operator | **200 on all `/admin/*` reads (AUD-002)** |
| Roleless self-signup user | 403 on 30+ feature endpoints; 200 on marketplace, notifications, `/plugins`, `/tenants/me` |
| Login brute force (120 attempts) | 120 × 401, **0 × 429** |
| Serialization / CORS / schema | no serialization errors; local CORS rejects unknown origins; see AUD-035 for production config |
| Frontend ↔ backend route drift | route sweep of 65 static pages as operator: **0 failing API calls** |
| Hardcoded production URLs | web: `next.config` falls back to `https://umrah-connect-api.onrender.com` when `VERCEL`/production; mobile: dead `trycloudflare.com` fallback (AUD-021) |

## Suites run (each once, this session)

| Suite | Result |
|---|---|
| `bp02_supply.py` — hotels, transport, visa | 24/24 |
| `bp05_social.py` — likes, comments, follow, groups | 23/23 |
| `bp06_visa_requests.py` — ticket workflow | 51/51 |
| `bp07_admin.py` — tenants & users admin | 55/55 (after a fixture fix — see CURRENT_STATE_AUDIT §2) |
| `bp08_visa_documents.py` — documents | 46/46 |
| `bp09_payments.py` — gateway abstraction | 46/46 |
| ad-hoc cross-account probe — connections, messaging, marketplace loop | connections ✓, messaging ✓, request→offer→accept→booking ✓, discovery ✗ (AUD-009) |

**Caveat:** a green suite proves the behaviour it asserts. Several suites were written against the current single-role model and therefore
*pass while AUD-002 exists* — bp07 exercises platform admin with a tenant operator account and does not assert that doing so should be forbidden.

## JWT-only routes (no permission check) — 39

These accept any authenticated user, including a roleless self-signup. Most are intentionally user-scoped (own notifications,
own connections, own marketplace requests). The ones that warrant review are flagged.

| Method | Route | Note |
|---|---|---|
| POST | `/api/v1/auth/logout` |  |
| GET | `/api/v1/auth/me` |  |
| GET | `/api/v1/connections` |  |
| POST | `/api/v1/connections/:id/accept` |  |
| POST | `/api/v1/connections/:id/reject` |  |
| GET | `/api/v1/connections/pending` |  |
| POST | `/api/v1/connections/request` |  |
| GET | `/api/v1/connections/status/:userId` |  |
| DELETE | `/api/v1/connections/with/:userId` |  |
| POST | `/api/v1/groups/:id/join` |  |
| POST | `/api/v1/groups/:id/leave` |  |
| POST | `/api/v1/groups/invites/:inviteId/respond` |  |
| GET | `/api/v1/marketplace/bookings/mine` |  |
| POST | `/api/v1/marketplace/listings/:id/bookings` |  |
| POST | `/api/v1/marketplace/requests` |  |
| GET | `/api/v1/marketplace/requests/:id` | **AUD-013** no ownership check |
| POST | `/api/v1/marketplace/requests/:id/close` |  |
| POST | `/api/v1/marketplace/requests/:id/offers` |  |
| POST | `/api/v1/marketplace/requests/:id/offers/:offerId/accept` |  |
| POST | `/api/v1/marketplace/requests/:id/offers/:offerId/convert-to-booking` |  |
| POST | `/api/v1/marketplace/requests/:id/offers/:offerId/reject` |  |
| GET | `/api/v1/marketplace/requests/mine` |  |
| GET | `/api/v1/marketplace/requests/offers/mine` |  |
| GET | `/api/v1/marketplace/requests/open` | **AUD-009** own-tenant only |
| GET | `/api/v1/notifications` |  |
| PATCH | `/api/v1/notifications/read` |  |
| POST | `/api/v1/notifications/read-all` |  |
| GET | `/api/v1/plugins` |  |
| DELETE | `/api/v1/plugins/:pluginId` | **AUD-033** JWT only |
| POST | `/api/v1/plugins/:pluginId/install` | **AUD-033** JWT only |
| GET | `/api/v1/rbac/my-permissions` |  |
| GET | `/api/v1/social/conversations` |  |
| GET | `/api/v1/social/conversations/:id/messages` |  |
| POST | `/api/v1/social/conversations/:id/messages` |  |
| POST | `/api/v1/social/conversations/open` |  |
| GET | `/api/v1/tenants/me` |  |
| POST | `/api/v1/tenants/me/kyc` |  |
| GET | `/api/v1/tenants/me/plugins` |  |
| POST | `/api/v1/uploads` | **AUD-032** extension-only validation |

## Full inventory

Status column: annotations only where a finding applies; unannotated routes had no defect found (and GET routes were exercised as described above).

### admin (27)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/stats` | JWT | core:tenant:read | `getStats` | **AUD-002** reachable by any tenant operator |
| GET | `/api/v1/admin/tenants` | JWT | core:tenant:read | `listTenants` | **AUD-002** reachable by any tenant operator |
| GET | `/api/v1/admin/tenants/export` | JWT | core:tenant:read | `exportTenants` | **AUD-002** reachable by any tenant operator |
| GET | `/api/v1/admin/tenants/:id` | JWT | core:tenant:read | `findTenant` | **AUD-002** reachable by any tenant operator |
| PUT | `/api/v1/admin/tenants/:id/status` | JWT | core:tenant:update | `setTenantStatus` | **AUD-002** cross-tenant mutation |
| DELETE | `/api/v1/admin/tenants/:id` | JWT | core:tenant:update | `archiveTenant` | **AUD-002** cross-tenant mutation |
| GET | `/api/v1/admin/users` | JWT | core:user:read | `listUsers` | **AUD-002** reachable by any tenant operator |
| GET | `/api/v1/admin/users/export` | JWT | core:user:read | `exportUsers` | **AUD-002** reachable by any tenant operator |
| PUT | `/api/v1/admin/users/:id/status` | JWT | core:user:update | `setUserStatus` | **AUD-002** cross-tenant mutation |
| POST | `/api/v1/admin/users/:id/force-logout` | JWT | core:user:update | `forceLogout` | **AUD-002** cross-tenant mutation |
| POST | `/api/v1/admin/users/:id/roles` | JWT | core:role:manage | `assignRole` | **AUD-002** cross-tenant mutation |
| DELETE | `/api/v1/admin/users/:id/roles/:roleId` | JWT | core:role:manage | `removeRole` | **AUD-002** cross-tenant mutation |
| GET | `/api/v1/admin/kyc` | JWT | core:tenant:read | `listKyc` | **AUD-002** reachable by any tenant operator |
| GET | `/api/v1/admin/kyc/:id` | JWT | core:tenant:read | `findKyc` | **AUD-002** reachable by any tenant operator |
| POST | `/api/v1/admin/kyc` | JWT | core:tenant:update | `createKyc` | **AUD-002** cross-tenant mutation |
| PUT | `/api/v1/admin/kyc/:id/approve` | JWT | core:tenant:update | `approveKyc` | **AUD-002** cross-tenant mutation |
| PUT | `/api/v1/admin/kyc/:id/reject` | JWT | core:tenant:update | `rejectKyc` | **AUD-002** cross-tenant mutation |
| GET | `/api/v1/admin/roles` | JWT | core:role:manage | `listRoles` | **AUD-002** reachable by any tenant operator |
| GET | `/api/v1/admin/roles/:id` | JWT | core:role:manage | `findRole` | **AUD-002** reachable by any tenant operator |
| GET | `/api/v1/admin/permissions` | JWT | core:role:manage | `listPermissions` | **AUD-002** reachable by any tenant operator |
| GET | `/api/v1/admin/listings` | JWT | marketplace:listing:read | `listAllListings` | **AUD-002** reachable by any tenant operator |
| PUT | `/api/v1/admin/listings/:id/approve` | JWT | marketplace:listing:manage | `approveListing` | **AUD-002** cross-tenant mutation |
| DELETE | `/api/v1/admin/listings/:id` | JWT | marketplace:listing:manage | `removeListing` | **AUD-002** cross-tenant mutation |
| GET | `/api/v1/admin/bookings` | JWT | booking:booking:read | `listAllBookings` | **AUD-002** reachable by any tenant operator |
| GET | `/api/v1/admin/finance` | JWT | finance:report:read | `getFinanceSummary` | **AUD-002** reachable by any tenant operator |
| GET | `/api/v1/admin/audit-logs` | JWT | core:tenant:read | `listAuditLogs` | **AUD-002** reachable by any tenant operator |
| GET | `/api/v1/admin/settings` | JWT | core:tenant:read | `getSettings` | **AUD-002** reachable by any tenant operator |

### auth (9)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | — | `register` | **AUD-005** yields roleless account |
| POST | `/api/v1/auth/login` | Public | — | `login` | **AUD-007** no rate limit · verified 200/401/400 |
| POST | `/api/v1/auth/forgot-password` | Public | — | `forgotPassword` | **AUD-010/015** no mailer; token logged |
| POST | `/api/v1/auth/reset-password` | Public | — | `resetPassword` | **AUD-014** token reusable · flow verified |
| POST | `/api/v1/auth/otp/send` | Public | — | `sendOtp` |  |
| POST | `/api/v1/auth/otp/verify` | Public | — | `verifyOtp` |  |
| POST | `/api/v1/auth/refresh` | Public | — | `refresh` |  |
| POST | `/api/v1/auth/logout` | JWT | JWT only | `logout` |  |
| GET | `/api/v1/auth/me` | JWT | JWT only | `me` |  |

### bookings (17)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/bookings/stats` | JWT | booking:booking:read | `getStats` |  |
| GET | `/api/v1/bookings` | JWT | booking:booking:read | `findAll` |  |
| POST | `/api/v1/bookings` | JWT | booking:booking:create | `create` |  |
| GET | `/api/v1/bookings/:id` | JWT | booking:booking:read | `findOne` |  |
| PUT | `/api/v1/bookings/:id` | JWT | booking:booking:update | `update` |  |
| PUT | `/api/v1/bookings/:id/status` | JWT | booking:booking:update | `updateStatus` |  |
| PUT | `/api/v1/bookings/:id/assign-group` | JWT | booking:booking:update | `assignGroup` |  |
| PUT | `/api/v1/bookings/:id/assign-package` | JWT | booking:booking:update | `assignPackage` |  |
| PUT | `/api/v1/bookings/:id/payment` | JWT | booking:booking:update | `setPayment` |  |
| POST | `/api/v1/bookings/:id/cancel` | JWT | booking:booking:update | `cancel` |  |
| POST | `/api/v1/bookings/:id/generate-invoice` | JWT | booking:booking:update | `generateInvoice` |  |
| POST | `/api/v1/bookings/:id/pilgrims` | JWT | booking:booking:update | `addPilgrim` |  |
| DELETE | `/api/v1/bookings/:id/pilgrims/:pilgrimId` | JWT | booking:booking:update | `removePilgrim` |  |
| GET | `/api/v1/packages` | JWT | booking:package:read | `findAllPackages` |  |
| POST | `/api/v1/packages` | JWT | booking:package:manage | `createPackage` |  |
| GET | `/api/v1/packages/:id` | JWT | booking:package:read | `findOnePackage` |  |
| PUT | `/api/v1/packages/:id` | JWT | booking:package:manage | `updatePackage` |  |

### compliance (23)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/compliance/visas` | JWT | visa:application:read | `findVisas` |  |
| POST | `/api/v1/compliance/visas` | JWT | visa:application:submit | `createVisa` |  |
| GET | `/api/v1/compliance/visas/stats` | JWT | visa:application:read | `getStats` |  |
| GET | `/api/v1/compliance/visas/dashboard-stats` | JWT | visa:application:read | `getDashboardStats` |  |
| GET | `/api/v1/compliance/visas/documents` | JWT | visa:application:read | `allDocuments` |  |
| GET | `/api/v1/compliance/visas/documents/stats` | JWT | visa:application:read | `documentStats` |  |
| GET | `/api/v1/compliance/visas/:id` | JWT | visa:application:read | `findOne` |  |
| PUT | `/api/v1/compliance/visas/:id` | JWT | visa:application:submit | `updateVisa` |  |
| DELETE | `/api/v1/compliance/visas/:id` | JWT | visa:application:submit | `deleteVisa` |  |
| PUT | `/api/v1/compliance/visas/:id/submit` | JWT | visa:application:submit | `submitVisa` |  |
| PUT | `/api/v1/compliance/visas/:id/approve` | JWT | visa:application:manage | `approveVisa` |  |
| PUT | `/api/v1/compliance/visas/:id/reject` | JWT | visa:application:manage | `rejectVisa` |  |
| GET | `/api/v1/compliance/visas/:id/documents` | JWT | visa:application:read | `listDocuments` |  |
| POST | `/api/v1/compliance/visas/:id/documents` | JWT | visa:application:submit | `addDocument` |  |
| GET | `/api/v1/compliance/visas/:id/documents/:docId` | JWT | visa:application:read | `findDocument` |  |
| GET | `/api/v1/compliance/visas/:id/documents/:docId/versions` | JWT | visa:application:read | `documentVersions` |  |
| POST | `/api/v1/compliance/visas/:id/documents/:docId/versions` | JWT | visa:application:submit | `uploadDocumentVersion` |  |
| PUT | `/api/v1/compliance/visas/:id/documents/:docId` | JWT | visa:application:submit | `updateDocument` |  |
| PUT | `/api/v1/compliance/visas/:id/documents/:docId/verify` | JWT | visa:application:manage | `verifyDocument` |  |
| PUT | `/api/v1/compliance/visas/:id/documents/:docId/reject` | JWT | visa:application:manage | `rejectDocument` |  |
| DELETE | `/api/v1/compliance/visas/:id/documents/:docId` | JWT | visa:application:submit | `removeDocument` |  |
| GET | `/api/v1/compliance/submissions` | JWT | visa:application:read | `findSubmissions` |  |
| POST | `/api/v1/compliance/submissions` | JWT | visa:application:manage | `createSubmission` |  |

### connections (7)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| POST | `/api/v1/connections/request` | JWT | JWT only | `request` |  |
| POST | `/api/v1/connections/:id/accept` | JWT | JWT only | `accept` |  |
| POST | `/api/v1/connections/:id/reject` | JWT | JWT only | `reject` |  |
| DELETE | `/api/v1/connections/with/:userId` | JWT | JWT only | `remove` |  |
| GET | `/api/v1/connections` | JWT | JWT only | `list` |  |
| GET | `/api/v1/connections/pending` | JWT | JWT only | `pending` |  |
| GET | `/api/v1/connections/status/:userId` | JWT | JWT only | `status` |  |

### finance (21)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/finance/invoices` | JWT | finance:invoice:read | `findInvoices` |  |
| POST | `/api/v1/finance/invoices` | JWT | finance:invoice:create | `createInvoice` |  |
| GET | `/api/v1/finance/invoices/:id` | JWT | finance:invoice:read | `findOne` |  |
| PUT | `/api/v1/finance/invoices/:id` | JWT | finance:invoice:create | `updateInvoice` |  |
| PUT | `/api/v1/finance/invoices/:id/status` | JWT | finance:invoice:create | `setStatus` |  |
| PUT | `/api/v1/finance/invoices/:id/issue` | JWT | finance:invoice:create | `issue` |  |
| PUT | `/api/v1/finance/invoices/:id/void` | JWT | finance:invoice:create | `void` |  |
| DELETE | `/api/v1/finance/invoices/:id` | JWT | finance:invoice:create | `deleteInvoice` |  |
| POST | `/api/v1/finance/invoices/:id/payments` | JWT | finance:payment:process | `recordPayment` |  |
| GET | `/api/v1/finance/payments` | JWT | finance:invoice:read | `findPayments` |  |
| GET | `/api/v1/finance/payments/:id` | JWT | finance:invoice:read | `findPayment` |  |
| PUT | `/api/v1/finance/payments/:id` | JWT | finance:payment:process | `updatePayment` |  |
| POST | `/api/v1/finance/payments/:id/refund` | JWT | finance:payment:process | `refundPayment` |  |
| GET | `/api/v1/finance/summary` | JWT | finance:report:read | `getSummary` |  |
| GET | `/api/v1/finance/stats` | JWT | finance:report:read | `getStats` |  |
| GET | `/api/v1/finance/dashboard-stats` | JWT | finance:report:read | `getDashboardStats` |  |
| GET | `/api/v1/finance/budget-plans` | JWT | finance:report:read | `findBudgetPlans` |  |
| POST | `/api/v1/finance/budget-plans` | JWT | finance:invoice:create | `createBudgetPlan` |  |
| GET | `/api/v1/finance/budget-plans/:id` | JWT | finance:report:read | `findBudgetPlan` |  |
| PUT | `/api/v1/finance/budget-plans/:id` | JWT | finance:invoice:create | `updateBudgetPlan` |  |
| DELETE | `/api/v1/finance/budget-plans/:id` | JWT | finance:invoice:create | `deleteBudgetPlan` |  |

### groups (36)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/groups` | JWT | crm:pilgrim:read | `findAll` |  |
| GET | `/api/v1/groups/public` | Public | — | `findPublic` |  |
| POST | `/api/v1/groups` | JWT | crm:pilgrim:update | `create` |  |
| GET | `/api/v1/groups/stats` | JWT | crm:pilgrim:read | `getStats` |  |
| GET | `/api/v1/groups/:id` | JWT | crm:pilgrim:read | `findOne` |  |
| PUT | `/api/v1/groups/:id` | JWT | crm:pilgrim:update | `update` |  |
| DELETE | `/api/v1/groups/:id` | JWT | crm:pilgrim:update | `remove` |  |
| GET | `/api/v1/groups/:id/members` | JWT | crm:pilgrim:read | `listMembers` |  |
| POST | `/api/v1/groups/:id/members` | JWT | crm:pilgrim:update | `addMember` |  |
| DELETE | `/api/v1/groups/:id/members/:userId` | JWT | crm:pilgrim:update | `removeMember` |  |
| POST | `/api/v1/groups/:id/join` | JWT | JWT only | `joinGroup` |  |
| POST | `/api/v1/groups/:id/leave` | JWT | JWT only | `leaveGroup` |  |
| GET | `/api/v1/groups/:id/invites` | JWT | crm:pilgrim:read | `listInvites` |  |
| POST | `/api/v1/groups/:id/invites` | JWT | crm:pilgrim:update | `createInvite` |  |
| POST | `/api/v1/groups/invites/:inviteId/respond` | JWT | JWT only | `respondInvite` |  |
| GET | `/api/v1/groups/:id/posts` | JWT | crm:pilgrim:read | `listPosts` |  |
| POST | `/api/v1/groups/:id/posts` | JWT | crm:pilgrim:update | `createPost` |  |
| DELETE | `/api/v1/groups/posts/:postId` | JWT | crm:pilgrim:update | `deletePost` |  |
| GET | `/api/v1/groups/posts/:postId/comments` | JWT | crm:pilgrim:read | `listComments` |  |
| POST | `/api/v1/groups/posts/:postId/comments` | JWT | crm:pilgrim:update | `createComment` |  |
| GET | `/api/v1/groups/:id/polls` | JWT | crm:pilgrim:read | `listPolls` |  |
| POST | `/api/v1/groups/:id/polls` | JWT | crm:pilgrim:update | `createPoll` |  |
| POST | `/api/v1/groups/polls/:pollId/vote` | JWT | crm:pilgrim:read | `vote` |  |
| POST | `/api/v1/groups/polls/:pollId/close` | JWT | crm:pilgrim:update | `closePoll` |  |
| GET | `/api/v1/groups/:id/notes` | JWT | crm:pilgrim:read | `listNotes` |  |
| POST | `/api/v1/groups/:id/notes` | JWT | crm:pilgrim:update | `createNote` |  |
| PUT | `/api/v1/groups/notes/:noteId` | JWT | crm:pilgrim:update | `updateNote` |  |
| DELETE | `/api/v1/groups/notes/:noteId` | JWT | crm:pilgrim:update | `deleteNote` |  |
| GET | `/api/v1/groups/:id/documents` | JWT | crm:pilgrim:read | `listDocuments` |  |
| POST | `/api/v1/groups/:id/documents` | JWT | crm:pilgrim:update | `addDocument` |  |
| DELETE | `/api/v1/groups/documents/:documentId` | JWT | crm:pilgrim:update | `deleteDocument` |  |
| GET | `/api/v1/groups/:id/related` | JWT | crm:pilgrim:read | `getRelated` |  |
| POST | `/api/v1/groups/:id/pilgrims` | JWT | crm:pilgrim:update | `addPilgrim` |  |
| GET | `/api/v1/groups/:id/incidents` | JWT | crm:pilgrim:read | `getIncidents` |  |
| POST | `/api/v1/groups/:id/incidents` | JWT | crm:pilgrim:update | `createIncident` |  |
| PUT | `/api/v1/groups/:id/incidents/:incidentId` | JWT | crm:pilgrim:update | `updateIncident` |  |

### health (2)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/health` | Public | — | `health` |  |
| GET | `/api/v1/health/ready` | Public | — | `ready` |  |

### hotels (22)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/hotels` | JWT | hotel:allotment:read | `findAll` |  |
| POST | `/api/v1/hotels` | JWT | hotel:allotment:manage | `create` |  |
| GET | `/api/v1/hotels/stats` | JWT | hotel:allotment:read | `getStats` |  |
| GET | `/api/v1/hotels/availability` | JWT | hotel:allotment:read | `checkAvailability` |  |
| GET | `/api/v1/hotels/bookings` | JWT | hotel:allotment:read | `getHotelBookings` |  |
| POST | `/api/v1/hotels/bookings` | JWT | hotel:allotment:manage | `createHotelBooking` |  |
| GET | `/api/v1/hotels/bookings/:bookingId` | JWT | hotel:allotment:read | `findHotelBooking` |  |
| PUT | `/api/v1/hotels/bookings/:bookingId` | JWT | hotel:allotment:manage | `updateHotelBooking` |  |
| PUT | `/api/v1/hotels/rooms/:roomId` | JWT | hotel:allotment:manage | `updateRoom` |  |
| DELETE | `/api/v1/hotels/rooms/:roomId` | JWT | hotel:allotment:manage | `deleteRoom` |  |
| PUT | `/api/v1/hotels/room-types/:roomTypeId` | JWT | hotel:allotment:manage | `updateRoomType` |  |
| GET | `/api/v1/hotels/:id` | JWT | hotel:allotment:read | `findOne` | **AUD-003** no tenant scope |
| PUT | `/api/v1/hotels/:id` | JWT | hotel:allotment:manage | `update` | **AUD-003** cross-tenant write proven |
| DELETE | `/api/v1/hotels/:id` | JWT | hotel:allotment:manage | `remove` | **AUD-003** no tenant scope |
| GET | `/api/v1/hotels/:id/room-types` | JWT | hotel:allotment:read | `getRoomTypes` | **AUD-003** no tenant scope |
| POST | `/api/v1/hotels/:id/room-types` | JWT | hotel:allotment:manage | `addRoomType` |  |
| GET | `/api/v1/hotels/:id/rooms` | JWT | hotel:allotment:read | `getRooms` | **AUD-003** cross-tenant read proven |
| POST | `/api/v1/hotels/:id/rooms` | JWT | hotel:allotment:manage | `createRoom` | **AUD-003** no tenant scope |
| GET | `/api/v1/hotels/:id/allotments` | JWT | hotel:allotment:manage | `getAllotments` |  |
| POST | `/api/v1/hotels/:id/allotments` | JWT | hotel:allotment:manage | `createAllotment` |  |
| GET | `/api/v1/hotels/:id/assignments` | JWT | hotel:assignment:manage | `getAssignments` | **AUD-016** unreachable |
| POST | `/api/v1/hotels/:id/assignments` | JWT | hotel:assignment:manage | `createAssignment` | **AUD-016** unreachable |

### inquiries (3)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| POST | `/api/v1/inquiries` | Public | — | `create` |  |
| GET | `/api/v1/inquiries` | JWT | core:tenant:read | `findAll` |  |
| PATCH | `/api/v1/inquiries/:id/status` | JWT | core:tenant:update | `updateStatus` |  |

### marketplace (24)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/marketplace/listings` | Public | — | `findAllListings` |  |
| GET | `/api/v1/marketplace/listings/mine` | JWT | marketplace:listing:read | `findMyListings` |  |
| GET | `/api/v1/marketplace/listings/:id` | Public | — | `findOneListing` |  |
| POST | `/api/v1/marketplace/listings` | JWT | marketplace:listing:manage | `createListing` |  |
| PUT | `/api/v1/marketplace/listings/:id` | JWT | marketplace:listing:manage | `updateListing` |  |
| DELETE | `/api/v1/marketplace/listings/:id` | JWT | marketplace:listing:manage | `deactivateListing` |  |
| POST | `/api/v1/marketplace/listings/:id/inquiries` | Public | — | `createInquiry` |  |
| GET | `/api/v1/marketplace/listings/:id/inquiries` | JWT | marketplace:listing:read | `listInquiries` |  |
| GET | `/api/v1/marketplace/inquiries` | JWT | marketplace:listing:read | `listMyInquiries` |  |
| PUT | `/api/v1/marketplace/inquiries/:id` | JWT | marketplace:listing:manage | `respondInquiry` |  |
| POST | `/api/v1/marketplace/listings/:id/bookings` | JWT | JWT only | `createBooking` |  |
| GET | `/api/v1/marketplace/listings/:id/bookings` | JWT | marketplace:listing:read | `listListingBookings` |  |
| GET | `/api/v1/marketplace/bookings` | JWT | marketplace:listing:read | `listMyBookings` |  |
| GET | `/api/v1/marketplace/bookings/mine` | JWT | JWT only | `listMyTravelerBookings` |  |
| PUT | `/api/v1/marketplace/bookings/:id` | JWT | marketplace:listing:manage | `updateBooking` |  |
| GET | `/api/v1/marketplace/vendors` | Public | — | `findAllVendors` |  |
| GET | `/api/v1/marketplace/vendors/mine` | JWT | marketplace:listing:read | `findMyVendor` |  |
| POST | `/api/v1/marketplace/vendors` | JWT | marketplace:listing:read | `createVendor` |  |
| GET | `/api/v1/marketplace/vendors/:id` | Public | — | `findOneVendor` |  |
| POST | `/api/v1/marketplace/vendors/:id/ratings` | JWT | marketplace:listing:read | `rateVendor` |  |
| POST | `/api/v1/marketplace/quotes` | JWT | marketplace:listing:manage | `createQuote` |  |
| GET | `/api/v1/marketplace/quotes` | JWT | marketplace:listing:read | `findMyQuotes` |  |
| PUT | `/api/v1/marketplace/quotes/:id` | JWT | marketplace:listing:manage | `respondToQuote` |  |
| PUT | `/api/v1/marketplace/quotes/:id/accept` | JWT | marketplace:listing:manage | `acceptQuote` |  |

### marketplace-requests (10)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| POST | `/api/v1/marketplace/requests` | JWT | JWT only | `create` |  |
| GET | `/api/v1/marketplace/requests/mine` | JWT | JWT only | `mine` |  |
| POST | `/api/v1/marketplace/requests/:id/close` | JWT | JWT only | `close` |  |
| GET | `/api/v1/marketplace/requests/open` | JWT | JWT only | `open` | **AUD-009** own-tenant only |
| GET | `/api/v1/marketplace/requests/:id` | JWT | JWT only | `findOne` | **AUD-013** no ownership check |
| POST | `/api/v1/marketplace/requests/:id/offers` | JWT | JWT only | `createOffer` |  |
| POST | `/api/v1/marketplace/requests/:id/offers/:offerId/accept` | JWT | JWT only | `acceptOffer` |  |
| POST | `/api/v1/marketplace/requests/:id/offers/:offerId/reject` | JWT | JWT only | `rejectOffer` |  |
| POST | `/api/v1/marketplace/requests/:id/offers/:offerId/convert-to-booking` | JWT | JWT only | `convertOfferToBooking` |  |
| GET | `/api/v1/marketplace/requests/offers/mine` | JWT | JWT only | `myOffers` |  |

### notifications (3)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/notifications` | JWT | JWT only | `list` |  |
| PATCH | `/api/v1/notifications/read` | JWT | JWT only | `markRead` |  |
| POST | `/api/v1/notifications/read-all` | JWT | JWT only | `markAllRead` |  |

### payments (7)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| POST | `/api/v1/payments/webhook/:provider` | Public | — | `webhook` | Public by design; HMAC + idempotency verified (bp09) |
| GET | `/api/v1/payments/providers` | JWT | finance:payment:read | `providers` |  |
| POST | `/api/v1/payments/intents` | JWT | finance:payment:process | `createIntent` |  |
| POST | `/api/v1/payments/intents/:id/confirm` | JWT | finance:payment:process | `confirmIntent` |  |
| GET | `/api/v1/payments/:id` | JWT | finance:payment:read | `findOne` |  |
| GET | `/api/v1/payments/:id/transactions` | JWT | finance:payment:read | `transactions` |  |
| POST | `/api/v1/payments/:id/refund` | JWT | finance:payment:process | `refund` |  |

### pilgrims (10)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/pilgrims/export` | JWT | crm:pilgrim:read | `export` |  |
| GET | `/api/v1/pilgrims/stats` | JWT | crm:pilgrim:read | `getStats` |  |
| GET | `/api/v1/pilgrims` | JWT | crm:pilgrim:read | `findAll` |  |
| POST | `/api/v1/pilgrims` | JWT | crm:pilgrim:create | `create` |  |
| GET | `/api/v1/pilgrims/:id` | JWT | crm:pilgrim:read | `findOne` |  |
| PUT | `/api/v1/pilgrims/:id` | JWT | crm:pilgrim:update | `update` |  |
| DELETE | `/api/v1/pilgrims/:id` | JWT | crm:pilgrim:delete | `remove` |  |
| POST | `/api/v1/pilgrims/:id/documents` | JWT | crm:pilgrim:update | `addDocument` |  |
| PUT | `/api/v1/pilgrims/:id/family-group` | JWT | crm:pilgrim:update | `assignToFamilyGroup` |  |
| POST | `/api/v1/pilgrims/:id/bookings` | JWT | crm:pilgrim:update | `assignToBooking` |  |

### plugin-host (3)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/plugins` | JWT | JWT only | `list` |  |
| POST | `/api/v1/plugins/:pluginId/install` | JWT | JWT only | `install` | **AUD-033** JWT only |
| DELETE | `/api/v1/plugins/:pluginId` | JWT | JWT only | `disable` | **AUD-033** JWT only |

### rbac (3)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/rbac/my-permissions` | JWT | JWT only | `myPermissions` |  |
| POST | `/api/v1/rbac/roles` | JWT | core:role:manage | `createRole` |  |
| POST | `/api/v1/rbac/assign` | JWT | core:role:manage | `assignRole` |  |

### reports (6)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/reports/overview` | JWT | finance:report:read | `getOverview` |  |
| GET | `/api/v1/reports/pilgrims` | JWT | finance:report:read | `getPilgrimAnalytics` |  |
| GET | `/api/v1/reports/bookings` | JWT | finance:report:read | `getBookingAnalytics` |  |
| GET | `/api/v1/reports/hotels` | JWT | finance:report:read | `getHotelAnalytics` |  |
| GET | `/api/v1/reports/finance` | JWT | finance:report:read | `getFinanceAnalytics` |  |
| GET | `/api/v1/reports/visa` | JWT | finance:report:read | `getVisaAnalytics` |  |

### social (20)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/social/feed` | JWT | social:post:read | `getFeed` |  |
| POST | `/api/v1/social/posts` | JWT | social:post:create | `createPost` |  |
| GET | `/api/v1/social/posts/:id` | JWT | social:post:read | `getPost` |  |
| PUT | `/api/v1/social/posts/:id` | JWT | social:post:create | `updatePost` |  |
| DELETE | `/api/v1/social/posts/:id` | JWT | social:post:create | `deletePost` |  |
| POST | `/api/v1/social/posts/:id/comments` | JWT | social:post:create | `addComment` |  |
| DELETE | `/api/v1/social/posts/:id/comments/:commentId` | JWT | social:post:create | `deleteComment` |  |
| POST | `/api/v1/social/posts/:id/react` | JWT | social:post:create | `react` |  |
| GET | `/api/v1/social/accounts/me` | JWT | social:post:read | `getMyAccount` |  |
| PUT | `/api/v1/social/accounts/me` | JWT | social:post:create | `updateMyAccount` |  |
| POST | `/api/v1/social/accounts/:id/follow` | JWT | social:post:create | `toggleFollow` |  |
| GET | `/api/v1/social/conversations` | JWT | JWT only | `listConversations` |  |
| POST | `/api/v1/social/conversations/open` | JWT | JWT only | `openConversation` |  |
| GET | `/api/v1/social/conversations/:id/messages` | JWT | JWT only | `listMessages` |  |
| POST | `/api/v1/social/conversations/:id/messages` | JWT | JWT only | `sendMessage` |  |
| POST | `/api/v1/social/posts/:id/save` | JWT | social:post:read | `toggleSavePost` |  |
| GET | `/api/v1/social/saved-posts` | JWT | social:post:read | `listSavedPosts` |  |
| GET | `/api/v1/social/discover/people` | JWT | social:post:read | `discoverPeople` |  |
| GET | `/api/v1/social/discover/groups` | JWT | social:post:read | `discoverGroups` |  |
| GET | `/api/v1/social/discover/trending` | JWT | social:post:read | `discoverTrending` |  |

### tenant (8)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| POST | `/api/v1/tenants` | Public | — | `create` | **AUD-008** unauthenticated tenant creation |
| GET | `/api/v1/tenants/slug/:slug` | Public | — | `getBySlug` |  |
| GET | `/api/v1/tenants/me` | JWT | JWT only | `getMyTenant` |  |
| PUT | `/api/v1/tenants/me` | JWT | core:tenant:update | `updateMyTenant` |  |
| POST | `/api/v1/tenants/me/kyc` | JWT | JWT only | `submitKyc` |  |
| GET | `/api/v1/tenants/me/sub-agents` | JWT | core:sub-agent:read | `getSubAgents` | **AUD-016** permission undefined → 403 for all |
| GET | `/api/v1/tenants/me/plugins` | JWT | JWT only | `getPlugins` |  |
| GET | `/api/v1/tenants/:id` | JWT | core:tenant:admin | `getTenant` | **AUD-016** permission undefined → 403 for all |

### transport (27)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/transport/vehicles` | JWT | transport:vehicle:read | `findVehicles` |  |
| GET | `/api/v1/transport/vehicles/:id` | JWT | transport:vehicle:read | `findVehicleById` |  |
| POST | `/api/v1/transport/vehicles` | JWT | transport:vehicle:manage | `createVehicle` |  |
| PUT | `/api/v1/transport/vehicles/:id` | JWT | transport:vehicle:manage | `updateVehicle` |  |
| DELETE | `/api/v1/transport/vehicles/:id` | JWT | transport:vehicle:manage | `deleteVehicle` |  |
| POST | `/api/v1/transport/vehicles/:id/drivers` | JWT | transport:vehicle:manage | `assignDriver` |  |
| DELETE | `/api/v1/transport/vehicles/:id/drivers/:driverId` | JWT | transport:vehicle:manage | `unassignDriver` |  |
| GET | `/api/v1/transport/drivers` | JWT | transport:vehicle:read | `findDrivers` |  |
| GET | `/api/v1/transport/drivers/:id` | JWT | transport:vehicle:read | `findDriverById` |  |
| POST | `/api/v1/transport/drivers` | JWT | transport:vehicle:manage | `createDriver` |  |
| PUT | `/api/v1/transport/drivers/:id` | JWT | transport:vehicle:manage | `updateDriver` |  |
| DELETE | `/api/v1/transport/drivers/:id` | JWT | transport:vehicle:manage | `deleteDriver` |  |
| GET | `/api/v1/transport/routes` | JWT | transport:vehicle:read | `findRoutes` |  |
| GET | `/api/v1/transport/routes/:id` | JWT | transport:vehicle:read | `findRouteById` |  |
| POST | `/api/v1/transport/routes` | JWT | transport:vehicle:manage | `createRoute` |  |
| PUT | `/api/v1/transport/routes/:id` | JWT | transport:vehicle:manage | `updateRoute` |  |
| DELETE | `/api/v1/transport/routes/:id` | JWT | transport:vehicle:manage | `deleteRoute` |  |
| GET | `/api/v1/transport/assignments` | JWT | transport:assignment:manage | `findAssignments` |  |
| GET | `/api/v1/transport/assignments/:id` | JWT | transport:assignment:manage | `findAssignmentById` |  |
| POST | `/api/v1/transport/assignments` | JWT | transport:assignment:manage | `createAssignment` |  |
| PUT | `/api/v1/transport/assignments/:id` | JWT | transport:assignment:manage | `updateAssignment` |  |
| POST | `/api/v1/transport/assignments/:id/cancel` | JWT | transport:assignment:manage | `cancelAssignment` |  |
| GET | `/api/v1/transport/bookings` | JWT | transport:assignment:manage | `findBookings` |  |
| POST | `/api/v1/transport/bookings` | JWT | transport:assignment:manage | `createBooking` |  |
| GET | `/api/v1/transport/tasreeh` | JWT | transport:vehicle:manage | `findTasreeh` |  |
| POST | `/api/v1/transport/tasreeh` | JWT | transport:vehicle:manage | `createTasreeh` |  |
| GET | `/api/v1/transport/stats` | JWT | transport:vehicle:read | `getStats` |  |

### uploads (1)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| POST | `/api/v1/uploads` | JWT | JWT only | `upload` | **AUD-032** extension-only validation |

### visa-requests (15)

| Method | Route | Auth | Permission | Handler | Finding |
|---|---|---|---|---|---|
| GET | `/api/v1/visa-requests` | JWT | visa:application:read | `findAll` |  |
| GET | `/api/v1/visa-requests/stats` | JWT | visa:application:read | `stats` |  |
| GET | `/api/v1/visa-requests/assignees` | JWT | visa:application:read | `assignees` |  |
| POST | `/api/v1/visa-requests` | JWT | visa:application:submit | `create` |  |
| GET | `/api/v1/visa-requests/:id` | JWT | visa:application:read | `findOne` |  |
| GET | `/api/v1/visa-requests/:id/public-thread` | JWT | visa:application:read | `publicThread` |  |
| PATCH | `/api/v1/visa-requests/:id` | JWT | visa:application:submit | `update` |  |
| PUT | `/api/v1/visa-requests/:id/assign` | JWT | visa:application:manage | `assign` |  |
| PUT | `/api/v1/visa-requests/:id/status` | JWT | visa:application:submit | `changeStatus` |  |
| POST | `/api/v1/visa-requests/:id/notes` | JWT | visa:application:submit | `addNote` |  |
| PUT | `/api/v1/visa-requests/:id/escalate` | JWT | visa:application:manage | `escalate` |  |
| PUT | `/api/v1/visa-requests/:id/resolve` | JWT | visa:application:submit | `resolve` |  |
| PUT | `/api/v1/visa-requests/:id/close` | JWT | visa:application:manage | `close` |  |
| PUT | `/api/v1/visa-requests/:id/reopen` | JWT | visa:application:manage | `reopen` |  |
| DELETE | `/api/v1/visa-requests/:id` | JWT | visa:application:manage | `remove` |  |
