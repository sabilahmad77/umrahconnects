/**
 * Client-side rules for provider onboarding and KYC, mirroring the server:
 *  - organization fields: platform/api/src/modules/tenant/dto/onboarding.dto.ts
 *  - KYC submission: TenantKycSubmissionDto in platform/api/src/modules/admin/dto/admin.dto.ts
 *  - accepted files: StorageService (content-sniffed PDF, JPEG, PNG, WebP, HEIC, TIFF, at most 15 MB)
 *
 * They exist so a person gets a clear message before sending anything; the
 * server validates the same things again and its answer is final.
 * tests/capability-onboarding.test.ts compares these with the server sources.
 */

export const ORGANIZATION_TYPES = [
  { value: 'OPERATOR', label: 'Umrah operator / agency', role: 'Operator administrator' },
  { value: 'MU_ASSASA', label: 'Ground services (Mu’assasa)', role: 'Operator administrator' },
  { value: 'VENDOR_HOTEL', label: 'Hotel / accommodation', role: 'Hotel manager' },
  { value: 'VENDOR_TRANSPORT', label: 'Transport company', role: 'Transport manager' },
  { value: 'VENDOR_VISA', label: 'Visa agency', role: 'Visa officer' },
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number]['value'];

export const SLUG_PATTERN = /^[a-z0-9-]{3,100}$/;
export const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** ISO 3166-1 alpha-2 codes the server's IsISO31661Alpha2 accepts. */
export const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO ' +
  'FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE ' +
  'JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO ' +
  'MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW ' +
  'PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM ' +
  'TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

export interface OrganizationForm {
  type: OrganizationType;
  name: string;
  nameAr: string;
  country: string;
  slug: string;
  email: string;
  phone: string;
  licenseNumber: string;
  website: string;
}

export type OrganizationField = keyof OrganizationForm;

export const EMPTY_ORGANIZATION: OrganizationForm = {
  type: 'OPERATOR',
  name: '',
  nameAr: '',
  country: 'SA',
  slug: '',
  email: '',
  phone: '',
  licenseNumber: '',
  website: '',
};

/** The address the server would generate from a name when no slug is given. */
export function suggestedSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'organization'
  );
}

function validWebsite(value: string): boolean {
  if (value.length > 255) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

/** Problems with the form, by field. An empty object means it may be sent. */
export function organizationProblems(form: OrganizationForm): Partial<Record<OrganizationField, string>> {
  const problems: Partial<Record<OrganizationField, string>> = {};
  const name = form.name.trim();
  if (!ORGANIZATION_TYPES.some((t) => t.value === form.type)) problems.type = 'Choose what kind of organization this is.';
  if (name.length < 2) problems.name = 'Enter the organization’s name (at least 2 characters).';
  else if (name.length > 255) problems.name = 'Use at most 255 characters.';
  if (form.nameAr.trim().length > 255) problems.nameAr = 'Use at most 255 characters.';
  if (!COUNTRY_CODES.includes(form.country.toUpperCase())) problems.country = 'Choose the country the organization is registered in.';
  if (form.slug && !SLUG_PATTERN.test(form.slug)) {
    problems.slug = 'Use 3–100 lowercase letters, digits or hyphens.';
  }
  if (form.email && (!EMAIL_PATTERN.test(form.email.trim()) || form.email.trim().length > 255)) {
    problems.email = 'Enter a valid email address.';
  }
  if (form.phone && !PHONE_PATTERN.test(form.phone.trim())) {
    problems.phone = 'Use international format with the country code, for example +966501234567.';
  }
  if (form.licenseNumber.trim().length > 100) problems.licenseNumber = 'Use at most 100 characters.';
  if (form.website && !validWebsite(form.website.trim())) {
    problems.website = 'Enter the full address, starting with https://';
  }
  return problems;
}

/** The request body for POST /onboarding/organization: trimmed, optional fields left out when empty. */
export function organizationPayload(form: OrganizationForm) {
  const optional = (value: string) => value.trim() || undefined;
  return {
    type: form.type,
    name: form.name.trim(),
    nameAr: optional(form.nameAr),
    country: form.country.toUpperCase(),
    slug: optional(form.slug),
    email: optional(form.email),
    phone: optional(form.phone),
    licenseNumber: optional(form.licenseNumber),
    website: optional(form.website),
  };
}

// ─── KYC ──────────────────────────────────────────────────────────────────────

export const KYC_MAX_BYTES = 15 * 1024 * 1024;
export const KYC_MAX_FILES = 20;

/** Accepted verification files, by extension and by the browser's MIME type. */
export const KYC_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tif', 'tiff'];
export const KYC_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/tiff',
];
export const KYC_ACCEPT = [...KYC_EXTENSIONS.map((e) => `.${e}`), ...KYC_MIME_TYPES].join(',');

/** Why a picked file cannot be uploaded, or null when it can. */
export function kycFileProblem(file: { name: string; size: number; type?: string }): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const typeOk = KYC_EXTENSIONS.includes(extension) || (!!file.type && KYC_MIME_TYPES.includes(file.type));
  if (!typeOk) return 'Use a PDF, JPEG, PNG, WebP, HEIC or TIFF file.';
  if (file.size === 0) return 'This file is empty.';
  if (file.size > KYC_MAX_BYTES) return 'This file is larger than 15 MB.';
  return null;
}

export const REGISTRY_SOURCES = [
  { value: 'MANUAL', label: 'Other — reviewed manually by Umrah Connect' },
  { value: 'NUSUK_MASAR', label: 'Nusuk / Masar (Saudi Arabia)' },
  { value: 'SISKOPATUH', label: 'SISKOPATUH (Indonesia)' },
  { value: 'NAHCON', label: 'NAHCON (Nigeria)' },
  { value: 'DIYANET', label: 'Diyanet (Türkiye)' },
  { value: 'TABUNG_HAJI', label: 'Tabung Haji (Malaysia)' },
  { value: 'MOTAC', label: 'MOTAC (Malaysia)' },
  { value: 'IBA_DGRP', label: 'IBA / DGRP' },
] as const;

export function formatBytes(bytes?: number): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The state of one KYC submission as the organization sees it. */
export type SubmissionState = 'approved' | 'rejected' | 'pending';

export function submissionState(record: { verifiedAt?: string | null; rejectionReason?: string | null }): SubmissionState {
  if (record.verifiedAt) return 'approved';
  if (record.rejectionReason) return 'rejected';
  return 'pending';
}
