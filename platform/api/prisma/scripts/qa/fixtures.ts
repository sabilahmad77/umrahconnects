import type { TenantType } from '@prisma/client';
import { COMMUNITY_TENANT_SLUG, PLATFORM_TENANT_SLUG, type RoleCode } from '../../../src/modules/rbac/catalog';

/**
 * Engineering 100 LOCAL QA fixtures. Synthetic people and organizations only:
 * every email is on the reserved `.test` domain, every fixture organization
 * carries `metadata.fixture`, and every document number starts with "QA-".
 */

export const QA_FIXTURE = 'engineering-100-local-qa';
export const QA_EMAIL_DOMAIN = 'qa.umrahconnect.test';

export interface QaOrganization {
  key: string;
  slug: string;
  name: string;
  type: TenantType;
  country: string;
  city: string;
  currency: string;
}

/** Fixture organizations (A and B for every business type, so isolation can be exercised for real). */
export const QA_ORGS: QaOrganization[] = [
  { key: 'operatorA', slug: 'qa-operator-a', name: 'Al-Noor Umrah Services', type: 'OPERATOR', country: 'SA', city: 'Riyadh', currency: 'SAR' },
  { key: 'operatorB', slug: 'qa-operator-b', name: 'Safa Marwa Travel', type: 'OPERATOR', country: 'PK', city: 'Lahore', currency: 'SAR' },
  { key: 'hotelA', slug: 'qa-hotel-a', name: 'Qasr Al-Haram Hotels', type: 'VENDOR_HOTEL', country: 'SA', city: 'Makkah', currency: 'SAR' },
  { key: 'hotelB', slug: 'qa-hotel-b', name: 'Taibah Garden Hotels', type: 'VENDOR_HOTEL', country: 'SA', city: 'Madinah', currency: 'SAR' },
  { key: 'transportA', slug: 'qa-transport-a', name: 'Rahala Coaches', type: 'VENDOR_TRANSPORT', country: 'SA', city: 'Jeddah', currency: 'SAR' },
  { key: 'transportB', slug: 'qa-transport-b', name: 'Sadeem Transport Company', type: 'VENDOR_TRANSPORT', country: 'SA', city: 'Makkah', currency: 'SAR' },
  { key: 'visaA', slug: 'qa-visa-a', name: 'Masar Visa Services', type: 'VENDOR_VISA', country: 'SA', city: 'Riyadh', currency: 'SAR' },
  { key: 'visaB', slug: 'qa-visa-b', name: 'Wijhat Visa Bureau', type: 'VENDOR_VISA', country: 'SA', city: 'Jeddah', currency: 'SAR' },
];

export interface QaIdentity {
  key: string;
  local: string; // email local part
  firstName: string;
  lastName: string;
  role: RoleCode;
  /** A key of QA_ORGS, or the shared platform / community organization. */
  org: string;
  verified: boolean;
  purpose: string;
}

export const PLATFORM_ORG = PLATFORM_TENANT_SLUG;
export const COMMUNITY_ORG = COMMUNITY_TENANT_SLUG;

export const QA_IDENTITIES: QaIdentity[] = [
  { key: 'travelerA', local: 'traveler.a', firstName: 'Amina', lastName: 'Rahman', role: 'PILGRIM', org: COMMUNITY_ORG, verified: true, purpose: 'Traveler with a record at Operator A (invite/accept/trip status)' },
  { key: 'travelerB', local: 'traveler.b', firstName: 'Bilal', lastName: 'Hamid', role: 'PILGRIM', org: COMMUNITY_ORG, verified: true, purpose: 'Second traveler with a record at Operator B (isolation)' },
  { key: 'travelerUnverified', local: 'traveler.unverified', firstName: 'Hana', lastName: 'Nasser', role: 'PILGRIM', org: COMMUNITY_ORG, verified: false, purpose: 'Signed up, email NOT verified (verification-gated flows)' },
  { key: 'travelerOnboarding', local: 'traveler.onboarding', firstName: 'Khalid', lastName: 'Mansour', role: 'PILGRIM', org: COMMUNITY_ORG, verified: true, purpose: 'Verified traveler with no organization yet (provider onboarding)' },
  { key: 'operatorAdminA', local: 'operator.admin.a', firstName: 'Yasmin', lastName: 'Qureshi', role: 'OPERATOR_ADMIN', org: 'operatorA', verified: true, purpose: 'Operator A administrator' },
  { key: 'operatorStaffA', local: 'operator.staff.a', firstName: 'Idris', lastName: 'Malik', role: 'OPERATOR_STAFF', org: 'operatorA', verified: true, purpose: 'Operator A day-to-day staff' },
  { key: 'financeA', local: 'finance.a', firstName: 'Noura', lastName: 'Aziz', role: 'FINANCE_MANAGER', org: 'operatorA', verified: true, purpose: 'Operator A finance only (FINANCE_MANAGER, nothing else)' },
  { key: 'operatorAdminB', local: 'operator.admin.b', firstName: 'Tariq', lastName: 'Siddiqui', role: 'OPERATOR_ADMIN', org: 'operatorB', verified: true, purpose: 'Operator B administrator (cross-tenant probes)' },
  { key: 'hotelA', local: 'hotel.a', firstName: 'Lina', lastName: 'Farouk', role: 'HOTEL_MANAGER', org: 'hotelA', verified: true, purpose: 'Hotel A manager' },
  { key: 'hotelB', local: 'hotel.b', firstName: 'Omar', lastName: 'Barakat', role: 'HOTEL_MANAGER', org: 'hotelB', verified: true, purpose: 'Hotel B manager' },
  { key: 'transportA', local: 'transport.a', firstName: 'Samir', lastName: 'Haddad', role: 'TRANSPORT_MANAGER', org: 'transportA', verified: true, purpose: 'Transport A manager' },
  { key: 'transportB', local: 'transport.b', firstName: 'Faris', lastName: 'Jaber', role: 'TRANSPORT_MANAGER', org: 'transportB', verified: true, purpose: 'Transport B manager' },
  { key: 'visaA', local: 'visa.a', firstName: 'Mariam', lastName: 'Saleh', role: 'VISA_OFFICER', org: 'visaA', verified: true, purpose: 'Visa agency A officer' },
  { key: 'visaB', local: 'visa.b', firstName: 'Zaid', lastName: 'Karim', role: 'VISA_OFFICER', org: 'visaB', verified: true, purpose: 'Visa agency B officer' },
  { key: 'superAdmin', local: 'superadmin', firstName: 'Rania', lastName: 'Haddad', role: 'SUPER_ADMIN', org: PLATFORM_ORG, verified: true, purpose: 'Platform Super Admin (separate from any documented account)' },
];

export const qaEmail = (identity: Pick<QaIdentity, 'local'>) => `${identity.local}@${QA_EMAIL_DOMAIN}`;
