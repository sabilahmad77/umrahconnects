# Operator Setup — accounts, roles and organizations

## Development accounts (`prisma/scripts/seed-demo-roles.ts`, local only)

Password: `DEMO_PASSWORD`, or the documented local default when unset. The script refuses to run with `NODE_ENV=production`.

| Role | Account | Organization |
|---|---|---|
| SUPER_ADMIN | superadmin@umrahconnect.dev | Umrah Connect Platform (PLATFORM) |
| OPERATOR_ADMIN | admin@alharamain.sa | Al Haramain (MU_ASSASA) |
| OPERATOR_STAFF | staff@alharamain.sa | Al Haramain |
| FINANCE_MANAGER | finance@alharamain.sa | Al Haramain |
| VISA_OFFICER | visa.officer@alharamain.sa | Al Haramain |
| HOTEL_MANAGER | hotel@makkahgrand.dev | Makkah Grand Hotels (VENDOR_HOTEL) |
| TRANSPORT_MANAGER | transport@haramaintransport.dev | Haramain Transport Co. (VENDOR_TRANSPORT) |
| VISA_OFFICER | visa@fastvisa.dev | FastVisa Agency (VENDOR_VISA) |
| PILGRIM (Traveler) | traveler@umrahconnect.dev | Umrah Connect Travelers (community) |

## Production

1. **Super Admin:** `PLATFORM_ADMIN_EMAIL=… PLATFORM_ADMIN_PASSWORD=… docker compose … run --rm api bootstrap-admin`. The password must be ≥ 14 characters with upper and lower case, a digit and a symbol. It is never printed. Re-running does not change the password unless `PLATFORM_ADMIN_RESET_PASSWORD=true`. Remove the variables from the env file afterwards.
2. **Organizations:** providers sign up (Traveler), confirm their email, then `POST /onboarding/organization`. They upload KYC (`POST /documents/kyc` → `POST /tenants/me/kyc`), and a Super Admin approves it in `/admin/kyc`. A Super Admin can also create an organization directly (`POST /tenants`).
3. **Staff inside an organization:** the organization admin grants roles from `GET /rbac/roles` via `POST /rbac/assign`. Only roles allowed for that organization type can be granted, and never capabilities the admin does not hold.
4. **Legacy data:** run `sync-rbac` once after migrating (legacy "Operator Admin" holders → `OPERATOR_ADMIN`; roleless community users → `PILGRIM`).

## Role → capability summary

| Role | Scope | Main capabilities |
|---|---|---|
| SUPER_ADMIN | platform | `platform:*` only (organizations, users, roles, KYC, audit, settings, marketplace moderation, cross-org bookings/finance read, inquiries) |
| OPERATOR_ADMIN | own organization | all organization capabilities |
| OPERATOR_STAFF | own organization | CRM, bookings, hotel/transport reads, visa submit, finance read, marketplace read, social, reports |
| HOTEL_MANAGER | own organization | hotels, rooms, allotments, assignments, invoices (create/approve), marketplace provider, social, team management |
| TRANSPORT_MANAGER | own organization | vehicles, drivers, routes, trips, tasreeh, invoices (create/approve), marketplace provider, social, team management |
| VISA_OFFICER | own organization | visa cases (submit/decide), travelers, documents, marketplace provider, social |
| FINANCE_MANAGER | own organization | invoices (create/approve), payments (collect/refund), financial and operational reports, booking read |
| PILGRIM (Traveler) | self | marketplace browse/book/checkout, requests, social, groups they belong to |
