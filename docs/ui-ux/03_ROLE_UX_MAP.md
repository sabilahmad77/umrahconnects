# Role experience map — Umrah Connect

Audit date: 17 September 2026. Repository: `/Users/macbook/Projects/umrah-connects`. This document records source inspection, not successful runtime authentication or permission testing. A route/component existing proves an implemented UI surface; it does not prove deployment, reliable data loading, or a correctly provisioned production role. Proposed navigation and metrics are explicitly identified below. No source was changed.

## Confirmed role model

The web application has **seven dashboard types**, not one dashboard with seven labels. `UserRole` declares nine identifiers, while the server system-role defaults use a different naming vocabulary. Do not equate the UI persona with a server authorization contract.

| Experience | Web dashboard type / declared identity | Auth destination | Source status |
|---|---|---|---|
| Operator / agency | `operator`; `OPERATOR_ADMIN`, `OPERATOR_STAFF`, `SUB_AGENT` | `/dashboard` | Operations Pulse implemented; staff/sub-agent have no separate shell |
| Hotel owner | `hotel`; `HOTEL_OWNER` | `/hotel-dashboard` | Role dashboard and room/hotel workflows implemented |
| Transport company | `transport`; `TRANSPORT_MANAGER` | `/transport-dashboard` | Fleet dashboard, drivers, routes, assignments and bookings implemented |
| Visa agency | `compliance`; `COMPLIANCE_OFFICER` | `/visa-dashboard` | Visa dashboard, application/document/request workflows implemented |
| Finance manager | `finance`; `FINANCE_MANAGER` | `/finance-dashboard` | Finance dashboard, invoices, payments and budget plans implemented |
| Traveler / pilgrim | `pilgrim`; `PILGRIM` | `/social` | Community landing implemented; `/travel-plan` already aggregates travel information; a dedicated Traveler Dashboard/default dashboard route is **PROPOSED / NOT CURRENTLY IMPLEMENTED** |
| Super Admin | `admin`; `SUPER_ADMIN` | `/admin-dashboard` | Platform overview and governance routes implemented |

Role selection precedence is Super Admin → Hotel → Transport → Compliance/Visa → Finance → Pilgrim → Operator fallback. The mapper uppercases names and uses substring checks. Thus lower-case `operator_finance` maps to finance, `operator_ops` and `sub_agent` map to operator. Unknown or empty roles also map to operator. Multi-role switching is not implemented by this mapper.

Evidence: [role definitions and inference](/Users/macbook/Projects/umrah-connects/apps/web/lib/auth.ts), [auth destinations](/Users/macbook/Projects/umrah-connects/apps/web/components/providers/auth-provider.tsx), [actual role navigation](/Users/macbook/Projects/umrah-connects/apps/web/components/layout/sidebar.tsx), [server system roles](/Users/macbook/Projects/umrah-connects/platform/api/src/modules/rbac/rbac.service.ts).

## Permissions and onboarding: established facts and limits

- The dashboard layout renders the same shell around all dashboard routes. The inspected AuthProvider verifies/restores a session and redirects signed-out users; it does not reject a signed-in user's route based on role. Sidebar visibility is navigation, not authorization.
- API JWT and Permissions guards are global in `platform/api/src/app.module.ts`. PermissionsGuard checks endpoint metadata against database role-permission membership, including tenant/global role scope and role expiry. Endpoints without required-permission metadata pass this particular guard; their JWT/service checks still matter.
- `SYSTEM_ROLES` explicitly defines `operator_admin` (the entire listed permission catalog), `operator_ops` (CRM, booking, allocation, visa submit, assignments, groups and read reporting), `operator_finance` (invoice/payment/report access and booking read), `sub_agent` (CRM/documents and package/booking read/create), and `pilgrim` (empty default permission list; comment says own-data service enforcement). It does not establish a complete default grant set for Hotel Owner, Transport Manager, Compliance Officer or Super Admin. Tenant-defined database roles may exist; they were not queried.
- Booking read/create/update and package management endpoints have distinct `RequirePermissions` declarations. Admin endpoints use core tenant/user/role and domain permission names; the inspected controller does not establish a standalone Super Admin-only route rule. Treat governance boundaries as a required product/security validation dependency before implementing a redesign.
- Public signup offers traveler, operator, hotel, transport, compliance and finance interests; admin interest is rejected server-side. Provider signup also creates an onboarding inquiry. **The register implementation creates a user without a nested role assignment.** Token generation derives roles from `userRoles`; the inspected create path returns an empty role list, and the client mapper falls back to operator. A comment promises a community-traveler role, but that assignment is not present in the inspected method. Verify registration provisioning before making a selected role appear immediately active.
- Local demo login obtains a real seeded operator-admin API session and overrides the display persona. Therefore a hotel/admin/pilgrim demo view is not proof of the permissions of a real hotel/admin/pilgrim account. The login UI says “No real data is affected”; the hook comment explicitly says writes go through. Runtime discovery must avoid creating or updating demo records.

Evidence: [API global guards](/Users/macbook/Projects/umrah-connects/platform/api/src/app.module.ts), [PermissionsGuard](/Users/macbook/Projects/umrah-connects/platform/api/src/common/guards/permissions.guard.ts), [RBAC defaults/query](/Users/macbook/Projects/umrah-connects/platform/api/src/modules/rbac/rbac.service.ts), [booking controller](/Users/macbook/Projects/umrah-connects/platform/api/src/modules/bookings/bookings.controller.ts), [admin controller](/Users/macbook/Projects/umrah-connects/platform/api/src/modules/admin/admin.controller.ts), [signup allow-list](/Users/macbook/Projects/umrah-connects/platform/api/src/modules/auth/dto/register.dto.ts), [register/token code](/Users/macbook/Projects/umrah-connects/platform/api/src/modules/auth/auth.service.ts), [demo hook](/Users/macbook/Projects/umrah-connects/apps/web/hooks/use-auth.ts).

## Traveler / pilgrim

**Primary goal:** organize a personal Umrah journey and communicate with the people/providers involved. Current default `/social` emphasizes community before travel readiness; deciding whether travel or community should lead is a product decision.

**Current navigation:** Social Hub, Discover, Connections, Messages, Groups; Marketplace, My Requests, My Offers, My Bookings, My Travel Plan; Profile and Settings. “My Offers” uses the current user's provider offers hook, so its intent for an ordinary traveler needs clarification rather than silently renaming it.

**Current summary measures:** `/travel-plan` shows groups, marketplace bookings, requests and visa applications. It calls general groups/compliance hooks alongside user-owned bookings/requests hooks. Its “Open requests” count uses the returned request collection without a status filter. Group/visa queries are limited to 20 and counts are collection lengths; they are not established complete personal totals. The same page presents failed/unavailable data as empty lists because it only aggregates loading flags. A redesign must preserve unavailable versus zero/empty distinctions and validate own-user scope.

**Critical actions:** browse services; create a service request; compare and accept/reject offers; read booking status; open conversations; inspect travel plan. **Secondary actions:** edit profile, join/inspect groups, connect with others, post in the social hub. High-frequency workflows are request → provider offers → accepted offer → booking and itinerary/status review.

**Proposed priority:** next trip summary → required next action → bookings/documents → requests/offers → community. Show status, dates, party size, currency and provider identity before decorative travel imagery. A proposed readiness checklist needs reliable personal eligibility/documents data; do not label a traveler “ready” from incomplete counts.

**Density:** low-to-medium, progressive detail; no platform revenue or tenant counts. **Mobile:** highest priority: readable itinerary cards, one clear action per booking/request, conversations, upload progress/retry, large controls, chronological travel stages. Bottom navigation may use Journey, Discover, Messages and Account, with requests accessible within Journey; this is a proposal requiring IA testing.

Evidence: [travel plan](/Users/macbook/Projects/umrah-connects/apps/web/components/travel-plan/travel-plan-view.tsx), [my bookings](/Users/macbook/Projects/umrah-connects/apps/web/components/my-bookings/my-bookings-view.tsx), [platform hooks](/Users/macbook/Projects/umrah-connects/apps/web/hooks/use-platform.ts), [request detail](/Users/macbook/Projects/umrah-connects/apps/web/components/requests/request-detail.tsx).

## Operator / agency

**Primary goal:** fulfill tenant bookings and coordinate pilgrims, packages, groups and service supply. Current navigation has My CRM, My Inventory, My Finance and Shared platform; operator is a tenant operations workspace, never the platform-governance console.

**Current measures:** total/active pilgrims, in-kingdom count, confirmed bookings, network hotels, fleet vehicles, paid/outstanding revenue; group summaries, recent bookings/pilgrims, booking trend and visa pipeline. `+12%`, `+8%`, `+18%` KPI trends are static literals; “All systems live” is rendered without a health query. They must not become visual proof of measured growth or live health.

**Critical actions:** create/update pilgrim records and documents; create and fulfill bookings; allocate groups, packages, hotels, transport and visas; inspect outstanding payments. **Secondary actions:** package/inventory administration, reports, marketplace listings/requests, connections and social. High-frequency workflows: pilgrim intake → document readiness → booking → service allocation → invoice/payment → trip group.

**Proposed navigation priority:** Today/Overview, Pilgrims, Bookings, Groups, Service inventory, Finance; Shared platform remains secondary. Default dashboard should lead with departures and blocked work if the underlying data supports those measures; do not manufacture a blockers metric.

**Density:** medium-high; compact KPI strip and readable operational table, with key identity/status/date columns. **Mobile:** triage and record lookup first; focused document/status edits in full-screen forms; detailed cross-record allocation remains better on wider screens. Staff and sub-agent variants should hide unavailable actions using server permissions, not role label alone; the current shell does not provide that granularity.

Evidence: [Operations Pulse](/Users/macbook/Projects/umrah-connects/apps/web/components/dashboard/operations-pulse.tsx), [booking list/detail](/Users/macbook/Projects/umrah-connects/apps/web/components/bookings/booking-list.tsx), [booking hooks](/Users/macbook/Projects/umrah-connects/apps/web/hooks/use-bookings.ts).

## Hotel owner

**Primary goal:** control accommodation availability and fulfill reservations/check-ins. **Current navigation:** Dashboard, My Hotels, Rooms & Inventory, Bookings, Finance, then Shared platform. My Hotels and Rooms & Inventory both target `/hotels`; active highlighting can mark both simultaneously.

**Current measures:** hotels/active properties, rooms/types, occupancy, bookings/pending reservations; available/booked/maintenance rooms, checked-in guests, collected/outstanding revenue, upcoming check-ins/check-outs, listings and inquiries.

**Critical actions:** inspect room inventory/allotments; manage reservations; inspect check-ins and check-outs. **Secondary actions:** property details, revenue review, marketplace inquiries/listings. High-frequency workflow: availability → reservation → room assignment → arrival/departure.

**Proposed priority:** date/property context → arrivals/departures → availability and reservation exceptions → revenue. Distinguish reservations from physical room occupancy and identify the metric's date range. A proposed availability calendar requires a supported per-date data source and is not assumed to exist.

**Density:** medium, becoming high in inventory grids. **Mobile:** arrival list and reservation detail; room status updates; vertical date controls; do not compress an entire inventory matrix into unreadable cells. Preserve actual hotel identity in header rather than platform-level tenant controls.

Evidence: [hotel dashboard](/Users/macbook/Projects/umrah-connects/apps/web/components/hotels/hotel-dashboard.tsx), [hotels list/detail](/Users/macbook/Projects/umrah-connects/apps/web/components/hotels/hotels-list.tsx), [hotel bookings](/Users/macbook/Projects/umrah-connects/apps/web/components/hotels/hotel-bookings-view.tsx), [hotel hooks](/Users/macbook/Projects/umrah-connects/apps/web/hooks/use-hotels.ts).

## Transport company

**Primary goal:** dispatch vehicles/drivers along routes and fulfill scheduled trips. **Current navigation:** Dashboard, Vehicles & Fleet, Drivers, Routes, Assignments, Bookings, Finance, Shared platform.

**Current measures:** vehicles/available, drivers/available, routes/active, assignments/scheduled; booked, maintenance and inactive vehicles, trips in progress, collected/pending revenue, marketplace listings/inquiries and upcoming assignments.

**Critical actions:** assign vehicle/driver; inspect upcoming/in-progress trips; maintain fleet and route records. **Secondary actions:** permit/Tasreeh details, maintenance, finance, marketplace. High-frequency workflow: request/booking → route/date/passengers → vehicle and driver allocation → trip status.

**Proposed priority:** operational date → upcoming departures/assignments → resource availability → booking exceptions → revenue. Do not draw a live vehicle map or GPS movement: no inspected UI evidence supports live tracking.

**Density:** high for dispatch; readable, sortable scheduling rows. **Mobile:** trip list and assignment details; one actionable status control with confirmation for consequential changes; phone/contact actions only where real contact data exists. Driver-facing app workflows are not inferred from a manager dashboard.

Evidence: [transport dashboard](/Users/macbook/Projects/umrah-connects/apps/web/components/transport/transport-dashboard.tsx), [assignments](/Users/macbook/Projects/umrah-connects/apps/web/components/transport/assignments-list.tsx), [transport tabs](/Users/macbook/Projects/umrah-connects/apps/web/components/transport/transport-tabs.tsx), [transport hooks](/Users/macbook/Projects/umrah-connects/apps/web/hooks/use-transport.ts).

## Visa agency / compliance officer

**Primary goal:** process applications and documents without losing regulatory status or applicant context. **Current navigation:** Dashboard, Visa Applications, Pilgrims/Applicants, Document Management, Service Requests, Finance, Reports, Shared platform.

**Current measures:** total applications/new requests, submitted + under review, approvals/success rate, collected/pending revenue; eight status tiles, listings, service requests and recent activity. An approval status is not a guarantee of current external regulatory eligibility; keep source/status/date traceable.

**Critical actions:** review applicant/document completeness, update application stages, process visa-service requests. **Secondary actions:** applicant records, reports, finance, listings. High-frequency workflow: intake → document collection → submission → review → decision → service fulfillment.

**Proposed priority:** applications needing review/document work → applicant queue → status pipeline → secondary commercial measures. Display rejection reasons and retry paths next to affected applications; proposed due-date/SLA fields need source support. Keep provider processing screen distinct from a traveler viewing their own application.

**Density:** high for queue, medium for single application; side-by-side document review on desktop. **Mobile:** applicant summary and missing-document tasks; document preview in full-screen viewer; preserve input and upload state; no multi-column review compression. Protect sensitive applicant details in list views.

Evidence: [visa dashboard](/Users/macbook/Projects/umrah-connects/apps/web/components/compliance/visa-dashboard.tsx), [application list](/Users/macbook/Projects/umrah-connects/apps/web/components/compliance/compliance-list.tsx), [document panel](/Users/macbook/Projects/umrah-connects/apps/web/components/compliance/visa-document-panel.tsx), [request queue](/Users/macbook/Projects/umrah-connects/apps/web/components/compliance/visa-request-queue.tsx).

## Finance manager

**Primary goal:** invoice, collect, reconcile and report money associated with tenant transactions. **Current navigation:** Dashboard, Invoices, Payments, Bookings, Budget Plans, Reports, Shared platform.

**Current measures:** revenue collected, outstanding amount/count, commission earned, financed bookings; draft/issued/partial/paid/overdue invoices, budget plans and recent transactions.

**Critical actions:** issue invoices; inspect payment status and gateway results; resolve unpaid/partial records. **Secondary actions:** budget plans/commissions, reports/export and booking references. High-frequency workflow: booking → invoice → payment intent/result → reconciliation/refund where permitted.

**Proposed priority:** outstanding/overdue queue → payment exceptions → invoice actions → reconciled totals. Keep collected funds, booked revenue, refunds and commission separate. Show currency per amount; never aggregate multiple currencies into one unlabeled total.

**Density:** high, table-led with exact values and durable reference IDs. **Mobile:** approval/review and lookup, amount/currency/recipient visible together; confirmations for financial changes; retain audit context. Payment-provider configuration is administrative context, not a consumer checkout feature.

Evidence: [finance dashboard](/Users/macbook/Projects/umrah-connects/apps/web/components/finance/finance-dashboard.tsx), [finance view](/Users/macbook/Projects/umrah-connects/apps/web/components/finance/finance-view.tsx), [gateway panel](/Users/macbook/Projects/umrah-connects/apps/web/components/finance/payment-gateway-panel.tsx), [payment hooks](/Users/macbook/Projects/umrah-connects/apps/web/hooks/use-payments.ts).

## Super Admin

**Primary goal:** govern the platform across organizations: tenants/users, verification, moderation, roles, settings, logs and support. **Current navigation:** Platform control, Governance, Intelligence, Shared platform and Config. Explicit “All” labels convey broad scope, though some links use shared tenant-oriented routes; validate actual cross-tenant data rather than relying on the label.

**Current measures:** tenants/by type, users, bookings, collected/outstanding revenue; pilgrims, operators, hotels, vehicles, pending KYC, active listings/open inquiries and recent platform activity. Bookings KPI currently links `/admin-tenants`, creating a mismatch between measure and destination.

**Critical actions:** review KYC; inspect tenant/user records; manage role grants; moderate listings; inspect inquiry/support work and logs. **Secondary actions:** platform analytics/finance/settings. High-frequency workflow: review queue → affected tenant/user → evidence → decision with audit context.

**Proposed priority:** platform scope indicator → pending governance work → system activity → ecosystem totals. Operator dashboard must not inherit tenant suspension, force logout, role grants, cross-tenant moderation or platform settings. Admin retains distinct section names, dense governance tables, persistent scope/tenant context and conspicuous destructive-action review.

**Density:** high and information-led. **Mobile:** urgent queue triage and read-only inspection first; complex role/permission editing uses a full-screen focused view. Do not simulate governance power with decorative charts or static health badges.

Evidence: [admin overview](/Users/macbook/Projects/umrah-connects/apps/web/components/admin/admin-dashboard.tsx), [admin hooks](/Users/macbook/Projects/umrah-connects/apps/web/hooks/use-admin.ts), [admin controller](/Users/macbook/Projects/umrah-connects/platform/api/src/modules/admin/admin.controller.ts), [roles UI](/Users/macbook/Projects/umrah-connects/apps/web/components/admin/admin-roles-view.tsx).

## Shared shell and decisions that affect every role

Current shell: deep-green sidebar, gold role badge/active marker, 244px expanded/68px manually collapsed width, shared white topbar, fixed viewport shell with internal main scroll. Main padding is a fixed `px-6`; header search is `w-72` and has no inspected search handler. There is no breakpoint-triggered sidebar drawer in the inspected layout/sidebar. Role-specific dashboard content grids respond, but this does not establish a usable mobile shell.

Proposed shared framework: role/organization scope, breadcrumbs, concise title/context, one primary action, optional filter row, action queue, then summaries/detail. On mobile, replace sidebar with a labeled menu drawer and role-appropriate short navigation; reduce main padding; open filters/form review in full-screen sheets. On tablet, use a collapsed rail only if there is enough content width; on desktop, keep labeled sections. Use text/icon/status combinations and accessible focus targets.

Required product decisions before implementation:

1. Traveler default: community landing or personal journey overview; retain `/travel-plan` content instead of pretending it is absent.
2. Registration: actual role assignment and provider pending-verification state; unknown roles must not appear to gain operator permissions.
3. Permission-aware actions: source of effective permissions for menus/forms, staff/sub-agent scope, and Super Admin boundary.
4. Own-data versus tenant/all-platform scope for shared groups/compliance/bookings/finance surfaces.
5. “My Offers” for travelers and duplicate Groups/Hotels sidebar destinations.
6. Reliable time ranges/data sources for summary metrics, health and trends.

Evidence: [dashboard layout](/Users/macbook/Projects/umrah-connects/apps/web/app/(dashboard)/layout.tsx), [sidebar](/Users/macbook/Projects/umrah-connects/apps/web/components/layout/sidebar.tsx), [header](/Users/macbook/Projects/umrah-connects/apps/web/components/layout/header.tsx).
