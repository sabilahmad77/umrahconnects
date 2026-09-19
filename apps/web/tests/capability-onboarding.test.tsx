import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  COUNTRY_CODES, EMPTY_ORGANIZATION, KYC_MAX_BYTES, ORGANIZATION_TYPES, PHONE_PATTERN, REGISTRY_SOURCES,
  SLUG_PATTERN, kycFileProblem, organizationPayload, organizationProblems, submissionState,
} from '../components/onboarding/organization-rules';

/**
 * Provider onboarding (W15): the form's rules must match what the API accepts,
 * and the page must show the right thing for each kind of account.
 */
const API = join(__dirname, '..', '..', '..', 'platform', 'api', 'src');
const source = (file: string) => readFileSync(join(API, file), 'utf8');
const ONBOARDING_DTO = source('modules/tenant/dto/onboarding.dto.ts');
const ADMIN_DTO = source('modules/admin/dto/admin.dto.ts');

const literalList = (src: string, name: string) => {
  const m = src.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`${name} not found`);
  return [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
};

describe('organization rules match the server DTO', () => {
  it('offers exactly the organization types the API accepts', () => {
    expect(ORGANIZATION_TYPES.map((t) => t.value)).toEqual(literalList(ONBOARDING_DTO, 'ONBOARDING_TYPES'));
  });

  it('uses the same slug and phone patterns', () => {
    expect(ONBOARDING_DTO).toContain(`/${SLUG_PATTERN.source}/`);
    expect(ONBOARDING_DTO).toContain(`/${PHONE_PATTERN.source}/`);
  });

  it('offers exactly the countries the server’s ISO 3166-1 check accepts', async () => {
    const { isISO31661Alpha2 } = await import('../../../platform/api/node_modules/class-validator');
    const accepted: string[] = [];
    for (let a = 65; a < 91; a += 1) {
      for (let b = 65; b < 91; b += 1) {
        const code = String.fromCharCode(a, b);
        if (isISO31661Alpha2(code)) accepted.push(code);
      }
    }
    expect(COUNTRY_CODES).toEqual(accepted);
  });

  it('offers exactly the registry sources a KYC submission accepts', () => {
    expect(REGISTRY_SOURCES.map((s) => s.value).sort()).toEqual(literalList(ADMIN_DTO, 'REGISTRY_SOURCES').sort());
  });

  it('limits files like the upload endpoint', () => {
    expect(source('modules/storage/storage.service.ts')).toContain('DOCUMENT_MAX_BYTES = 15 * 1024 * 1024');
    expect(source('modules/storage/documents.controller.ts')).toContain('fileSize: 15 * 1024 * 1024');
    expect(KYC_MAX_BYTES).toBe(15 * 1024 * 1024);
  });
});

describe('organization form validation', () => {
  const valid = { ...EMPTY_ORGANIZATION, name: 'Zamzam Coaches', country: 'SA' };

  it('accepts a minimal valid form and sends only what was filled in', () => {
    expect(organizationProblems(valid)).toEqual({});
    expect(organizationPayload({ ...valid, name: '  Zamzam Coaches  ', country: 'sa' })).toEqual({
      type: 'OPERATOR', name: 'Zamzam Coaches', country: 'SA',
      nameAr: undefined, slug: undefined, email: undefined, phone: undefined, licenseNumber: undefined, website: undefined,
    });
  });

  it.each([
    ['name', { name: 'Z' }],
    ['name', { name: 'x'.repeat(256) }],
    ['country', { country: 'XX' }],
    ['slug', { slug: 'Has Spaces' }],
    ['slug', { slug: 'ab' }],
    ['email', { email: 'not-an-email' }],
    ['phone', { phone: '0501234567' }],
    ['phone', { phone: '+0501234567' }],
    ['website', { website: 'zamzam.example' }],
    ['website', { website: 'ftp://zamzam.example' }],
    ['licenseNumber', { licenseNumber: 'x'.repeat(101) }],
  ])('flags %s: %j', (field, change) => {
    expect(Object.keys(organizationProblems({ ...valid, ...change }))).toEqual([field]);
  });

  it('accepts the optional fields in the formats the server expects', () => {
    expect(
      organizationProblems({
        ...valid, slug: 'zamzam-coaches', email: 'ops@zamzam.test', phone: '+966501234567', website: 'https://zamzam.test',
        licenseNumber: 'TR-1', nameAr: 'زمزم',
      }),
    ).toEqual({});
  });
});

describe('KYC file checks', () => {
  it.each([
    ['licence.pdf', 'application/pdf'], ['scan.JPG', 'image/jpeg'], ['id.png', ''], ['photo.heic', ''],
    ['doc.tiff', 'image/tiff'], ['page.webp', 'image/webp'],
  ])('accepts %s', (name, type) => {
    expect(kycFileProblem({ name, type, size: 1024 })).toBeNull();
  });

  it('refuses other types, empty files and files over 15 MB', () => {
    expect(kycFileProblem({ name: 'notes.docx', type: 'application/msword', size: 10 })).toMatch(/PDF, JPEG/);
    expect(kycFileProblem({ name: 'page.html', type: 'text/html', size: 10 })).toMatch(/PDF, JPEG/);
    expect(kycFileProblem({ name: 'empty.pdf', type: 'application/pdf', size: 0 })).toMatch(/empty/);
    expect(kycFileProblem({ name: 'big.pdf', type: 'application/pdf', size: KYC_MAX_BYTES + 1 })).toMatch(/15 MB/);
    expect(kycFileProblem({ name: 'max.pdf', type: 'application/pdf', size: KYC_MAX_BYTES })).toBeNull();
  });

  it('reads a submission’s state from its decision fields', () => {
    expect(submissionState({ verifiedAt: '2026-09-18', rejectionReason: null })).toBe('approved');
    expect(submissionState({ verifiedAt: null, rejectionReason: 'Blurry' })).toBe('rejected');
    expect(submissionState({ verifiedAt: null, rejectionReason: null })).toBe('pending');
  });
});

// ─── The page, per kind of account ────────────────────────────────────────────

const auth = vi.hoisted(() => ({ value: { user: null as any, isLoaded: true, setUser: () => {}, logout: async () => {} } }));
vi.mock('../components/providers/auth-provider', () => ({ useAuthContext: () => auth.value }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {}, push: () => {} }), usePathname: () => '/onboarding' }));

const account = (overrides: Record<string, unknown>) => ({
  id: 'u1', email: 'founder@example.test', tenantId: 't1', tenantName: 'Zamzam Coaches', tenantSlug: 'zamzam',
  tenantType: 'VENDOR_TRANSPORT', roles: ['TRANSPORT_MANAGER'], dashboardType: 'transport', displayName: 'Fatima',
  permissions: ['core:tenant:read', 'core:tenant:update', 'transport:vehicle:read'], tenantStatus: 'ACTIVE',
  emailVerified: true, ...overrides,
});

async function renderPage(user: Record<string, unknown>) {
  auth.value = { ...auth.value, user };
  const { OnboardingWorkspace } = await import('../components/onboarding/onboarding-workspace');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <OnboardingWorkspace />
    </QueryClientProvider>,
  );
}

const traveler = {
  tenantSlug: 'umrah-connect-travelers', tenantType: 'OPERATOR', tenantName: 'Umrah Connect Travelers',
  roles: ['PILGRIM'], dashboardType: 'pilgrim', permissions: ['marketplace:listing:read', 'social:post:create', 'social:post:read'],
};

describe('the onboarding page', () => {
  it('stops an unverified traveler with a way to confirm the email', async () => {
    const html = await renderPage(account({ ...traveler, emailVerified: false }));
    expect(html).toContain('Confirm your email address first');
    expect(html).toContain('Send confirmation email');
    expect(html).not.toContain('Create organization');
  });

  it('gives a verified traveler the registration form with every field the API accepts', async () => {
    const html = await renderPage(account(traveler));
    expect(html).toContain('Register your organization');
    for (const id of ['org-type', 'org-country', 'org-name', 'org-nameAr', 'org-slug', 'org-licenseNumber', 'org-email', 'org-phone', 'org-website']) {
      expect(html, id).toContain(`id="${id}"`);
    }
    expect(html).toContain('Create organization');
    expect(html).toContain('stops being a traveler account');
  });

  it('shows a pending organization its verification steps and the upload form', async () => {
    const html = await renderPage(account({ tenantStatus: 'PENDING_KYC' }));
    expect(html).toContain('Organization verification');
    expect(html).toContain('Documents needed');
    expect(html).toContain('Submit verification documents');
    expect(html).toContain('Add documents');
  });

  it('asks a rejected organization for corrected documents', async () => {
    const html = await renderPage(account({ tenantStatus: 'KYC_REJECTED' }));
    expect(html).toContain('Changes required');
    expect(html).toContain('Submit corrected documents');
  });

  it('does not offer uploads while a submission is under review, or to members who cannot submit', async () => {
    expect(await renderPage(account({ tenantStatus: 'KYC_SUBMITTED' }))).toContain('Awaiting review');
    expect(await renderPage(account({ tenantStatus: 'KYC_SUBMITTED' }))).not.toContain('Add documents');
    const member = await renderPage(account({ tenantStatus: 'PENDING_KYC', permissions: ['core:tenant:read'] }));
    expect(member).not.toContain('Add documents');
    expect(member).toContain('Your organization administrator submits the documents.');
  });

  it('shows an active organization its record, and a platform account the console', async () => {
    expect(await renderPage(account({}))).toContain('Zamzam Coaches is verified');
    const platform = await renderPage(
      account({ tenantType: 'PLATFORM', tenantSlug: 'umrah-connect-platform', dashboardType: 'admin', permissions: ['platform:kyc:review'] }),
    );
    expect(platform).toContain('Platform accounts do not register organizations');
    expect(platform).toContain('href="/admin-kyc"');
  });
});
