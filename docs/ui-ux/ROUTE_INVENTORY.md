# Web route inventory — implementation baseline

Inventoried before source changes. 79 actual page routes; dynamic segments represent route families. Existing resource articles are also individual content screens.

| Route | Role / domain | Source |
|---|---|---|
| /login | AUTH | `apps/web/app/(auth)/login/page.tsx` |
| /reset-password | AUTH | `apps/web/app/(auth)/reset-password/page.tsx` |
| /admin-dashboard | SUPER ADMIN | `apps/web/app/(dashboard)/admin-dashboard/page.tsx` |
| /admin-inquiries | SUPER ADMIN | `apps/web/app/(dashboard)/admin-inquiries/page.tsx` |
| /admin-kyc | SUPER ADMIN | `apps/web/app/(dashboard)/admin-kyc/page.tsx` |
| /admin-listings | SUPER ADMIN | `apps/web/app/(dashboard)/admin-listings/page.tsx` |
| /admin-logs | SUPER ADMIN | `apps/web/app/(dashboard)/admin-logs/page.tsx` |
| /admin-roles | SUPER ADMIN | `apps/web/app/(dashboard)/admin-roles/page.tsx` |
| /admin-settings | SUPER ADMIN | `apps/web/app/(dashboard)/admin-settings/page.tsx` |
| /admin-support | SUPER ADMIN | `apps/web/app/(dashboard)/admin-support/page.tsx` |
| /admin-tenants/[id] | SUPER ADMIN | `apps/web/app/(dashboard)/admin-tenants/[id]/page.tsx` |
| /admin-tenants | SUPER ADMIN | `apps/web/app/(dashboard)/admin-tenants/page.tsx` |
| /admin-users | SUPER ADMIN | `apps/web/app/(dashboard)/admin-users/page.tsx` |
| /bookings/[id] | OPERATOR / SHARED | `apps/web/app/(dashboard)/bookings/[id]/page.tsx` |
| /bookings | OPERATOR / SHARED | `apps/web/app/(dashboard)/bookings/page.tsx` |
| /budget-plans | OTHER CONFIRMED MODULES — FINANCE | `apps/web/app/(dashboard)/budget-plans/page.tsx` |
| /compliance/[id] | VISA AGENCY | `apps/web/app/(dashboard)/compliance/[id]/page.tsx` |
| /compliance | VISA AGENCY | `apps/web/app/(dashboard)/compliance/page.tsx` |
| /connections | TRAVELER | `apps/web/app/(dashboard)/connections/page.tsx` |
| /dashboard | OPERATOR / SHARED | `apps/web/app/(dashboard)/dashboard/page.tsx` |
| /discover | TRAVELER | `apps/web/app/(dashboard)/discover/page.tsx` |
| /finance/invoices/[id] | OTHER CONFIRMED MODULES — FINANCE | `apps/web/app/(dashboard)/finance/invoices/[id]/page.tsx` |
| /finance | OTHER CONFIRMED MODULES — FINANCE | `apps/web/app/(dashboard)/finance/page.tsx` |
| /finance-dashboard | OTHER CONFIRMED MODULES — FINANCE | `apps/web/app/(dashboard)/finance-dashboard/page.tsx` |
| /finance-payments | OTHER CONFIRMED MODULES — FINANCE | `apps/web/app/(dashboard)/finance-payments/page.tsx` |
| /groups/[id] | OPERATOR / SHARED | `apps/web/app/(dashboard)/groups/[id]/page.tsx` |
| /groups | OPERATOR / SHARED | `apps/web/app/(dashboard)/groups/page.tsx` |
| /hotel-bookings | HOTEL | `apps/web/app/(dashboard)/hotel-bookings/page.tsx` |
| /hotel-dashboard | HOTEL | `apps/web/app/(dashboard)/hotel-dashboard/page.tsx` |
| /hotels/[id] | HOTEL | `apps/web/app/(dashboard)/hotels/[id]/page.tsx` |
| /hotels | HOTEL | `apps/web/app/(dashboard)/hotels/page.tsx` |
| /marketplace/[id] | OPERATOR / SHARED | `apps/web/app/(dashboard)/marketplace/[id]/page.tsx` |
| /marketplace | OPERATOR / SHARED | `apps/web/app/(dashboard)/marketplace/page.tsx` |
| /messages | TRAVELER | `apps/web/app/(dashboard)/messages/page.tsx` |
| /my-bookings | TRAVELER | `apps/web/app/(dashboard)/my-bookings/page.tsx` |
| /my-offers | TRAVELER | `apps/web/app/(dashboard)/my-offers/page.tsx` |
| /packages | OPERATOR / SHARED | `apps/web/app/(dashboard)/packages/page.tsx` |
| /pilgrims/[id] | OPERATOR / SHARED | `apps/web/app/(dashboard)/pilgrims/[id]/page.tsx` |
| /pilgrims | OPERATOR / SHARED | `apps/web/app/(dashboard)/pilgrims/page.tsx` |
| /profile | TRAVELER | `apps/web/app/(dashboard)/profile/page.tsx` |
| /reports | OPERATOR / SHARED | `apps/web/app/(dashboard)/reports/page.tsx` |
| /requests/[id] | OPERATOR / SHARED | `apps/web/app/(dashboard)/requests/[id]/page.tsx` |
| /requests | OPERATOR / SHARED | `apps/web/app/(dashboard)/requests/page.tsx` |
| /settings | OPERATOR / SHARED | `apps/web/app/(dashboard)/settings/page.tsx` |
| /social | TRAVELER | `apps/web/app/(dashboard)/social/page.tsx` |
| /transport/assignments | TRANSPORT | `apps/web/app/(dashboard)/transport/assignments/page.tsx` |
| /transport/bookings | TRANSPORT | `apps/web/app/(dashboard)/transport/bookings/page.tsx` |
| /transport/drivers/[id] | TRANSPORT | `apps/web/app/(dashboard)/transport/drivers/[id]/page.tsx` |
| /transport/drivers | TRANSPORT | `apps/web/app/(dashboard)/transport/drivers/page.tsx` |
| /transport | TRANSPORT | `apps/web/app/(dashboard)/transport/page.tsx` |
| /transport/routes/[id] | TRANSPORT | `apps/web/app/(dashboard)/transport/routes/[id]/page.tsx` |
| /transport/routes | TRANSPORT | `apps/web/app/(dashboard)/transport/routes/page.tsx` |
| /transport/vehicles/[id] | TRANSPORT | `apps/web/app/(dashboard)/transport/vehicles/[id]/page.tsx` |
| /transport/vehicles | TRANSPORT | `apps/web/app/(dashboard)/transport/vehicles/page.tsx` |
| /transport-dashboard | TRANSPORT | `apps/web/app/(dashboard)/transport-dashboard/page.tsx` |
| /travel-plan | TRAVELER | `apps/web/app/(dashboard)/travel-plan/page.tsx` |
| /visa-dashboard | VISA AGENCY | `apps/web/app/(dashboard)/visa-dashboard/page.tsx` |
| /visa-documents | VISA AGENCY | `apps/web/app/(dashboard)/visa-documents/page.tsx` |
| /visa-requests/[id] | VISA AGENCY | `apps/web/app/(dashboard)/visa-requests/[id]/page.tsx` |
| /visa-requests | VISA AGENCY | `apps/web/app/(dashboard)/visa-requests/page.tsx` |
| /about | PUBLIC | `apps/web/app/about/page.tsx` |
| /api-docs | PUBLIC | `apps/web/app/api-docs/page.tsx` |
| /careers | PUBLIC | `apps/web/app/careers/page.tsx` |
| /contact | PUBLIC | `apps/web/app/contact/page.tsx` |
| /help | PUBLIC | `apps/web/app/help/page.tsx` |
| /integrations | PUBLIC | `apps/web/app/integrations/page.tsx` |
| /marketplace-preview | PUBLIC | `apps/web/app/marketplace-preview/page.tsx` |
| / | PUBLIC | `apps/web/app/page.tsx` |
| /partners | PUBLIC | `apps/web/app/partners/page.tsx` |
| /pricing | PUBLIC | `apps/web/app/pricing/page.tsx` |
| /privacy | PUBLIC | `apps/web/app/privacy/page.tsx` |
| /resources/[slug] | PUBLIC | `apps/web/app/resources/[slug]/page.tsx` |
| /resources | PUBLIC | `apps/web/app/resources/page.tsx` |
| /security | PUBLIC | `apps/web/app/security/page.tsx` |
| /signup | AUTH | `apps/web/app/signup/page.tsx` |
| /social-preview | PUBLIC | `apps/web/app/social-preview/page.tsx` |
| /solutions | PUBLIC | `apps/web/app/solutions/page.tsx` |
| /terms | PUBLIC | `apps/web/app/terms/page.tsx` |
| /workflow | PUBLIC | `apps/web/app/workflow/page.tsx` |
