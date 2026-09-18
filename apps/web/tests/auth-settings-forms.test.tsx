import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changePasswordProblems, changePasswordServerErrors } from '../lib/password-policy';

const state = vi.hoisted(() => ({
  profile: null as any,
  capabilities: { ready: true, can: (_c: string): boolean => false, isPlatform: false },
  user: null as any,
  google: { enabled: true, mode: 'google' } as { enabled: boolean; mode: 'google' | 'local-stub' },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('../components/providers/auth-provider', () => ({ useAuthContext: () => ({ user: state.user, isLoaded: true, setUser: vi.fn() }) }));
vi.mock('../hooks/use-capabilities', () => ({ useCapabilities: () => state.capabilities }));
vi.mock('../hooks/use-auth', () => ({
  useAccountProfile: () => ({ data: state.profile, isLoading: false, error: null, refetch: vi.fn() }),
  useGoogleSignInStatus: () => ({ data: state.google }),
  usePreferences: () => ({ data: undefined, isLoading: true, error: null, refetch: vi.fn() }),
  useUpdatePreferences: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}));

import SettingsPage from '../app/(dashboard)/settings/page';

const baseProfile = {
  id: 'u1',
  email: 'amina@example.test',
  firstName: 'Amina',
  lastName: 'Traveler',
  emailVerified: true,
  hasPassword: true,
  createdAt: '2026-09-18T10:00:00.000Z',
  locale: 'en',
  timezone: 'Asia/Riyadh',
  tenant: { id: 't1', name: 'Umrah Connect Travelers', slug: 'umrah-connect-travelers', type: 'OPERATOR', status: 'ACTIVE' },
  identities: [] as { provider: string; email: string | null; createdAt: string }[],
};

beforeEach(() => {
  state.profile = { ...baseProfile, identities: [] };
  state.user = { email: baseProfile.email, tenantName: 'Umrah Connect Travelers', tenantSlug: 'umrah-connect-travelers', tenantType: 'OPERATOR', dashboardType: 'pilgrim', emailVerified: true };
  state.capabilities = { ready: true, can: () => false, isPlatform: false };
  state.google = { enabled: true, mode: 'google' };
});

describe('change password validation', () => {
  it('checks the fields before anything is sent', () => {
    expect(changePasswordProblems({ currentPassword: '', newPassword: 'short', confirmPassword: '' })).toEqual({
      currentPassword: 'Enter your current password.',
      newPassword: 'Password must be 8–128 characters and include a letter and a number.',
    });
    expect(changePasswordProblems({ currentPassword: 'Same-Pass-1', newPassword: 'Same-Pass-1', confirmPassword: 'Same-Pass-1' }).newPassword).toMatch(/different/);
    expect(changePasswordProblems({ currentPassword: 'Old-Pass-1', newPassword: 'New-Pass-22', confirmPassword: 'New-Pass-23' })).toEqual({ confirmPassword: 'The passwords do not match.' });
    expect(changePasswordProblems({ currentPassword: 'Old-Pass-1', newPassword: 'New-Pass-22', confirmPassword: 'New-Pass-22' })).toEqual({});
  });

  it('puts server refusals next to the right field and says plainly when nothing changed', () => {
    const coded = (status: number, code: string) => ({ response: { status, data: { error: { code } } } });
    expect(changePasswordServerErrors(coded(400, 'CURRENT_PASSWORD_INCORRECT'), 'x')).toEqual({ currentPassword: 'Your current password is not correct.' });
    expect(changePasswordServerErrors(coded(400, 'PASSWORD_UNCHANGED'), 'x').newPassword).toMatch(/different/);
    expect(changePasswordServerErrors(coded(429, 'TOO_MANY_REQUESTS'), 'x').form).toMatch(/Too many attempts/);
    expect(changePasswordServerErrors({ request: {} }, 'x').form).toMatch(/was not changed/);
    expect(changePasswordServerErrors(coded(400, 'PASSWORD_NOT_SET'), 'server says so')).toEqual({ form: 'server says so' });
  });
});

describe('account settings page', () => {
  it('offers the full change-password form to an account with a password', () => {
    const html = renderToStaticMarkup(<SettingsPage />);
    expect(html).toContain('Change password');
    expect(html).toMatch(/id="current-password"[^>]*autocomplete="current-password"/i);
    expect(html).toMatch(/id="new-password"[^>]*autocomplete="new-password"/i);
    expect(html).toMatch(/id="confirm-password"/);
    expect(html).toContain('Sign out everywhere');
    expect(html).not.toContain('Email me a link to set a password');
  });

  it('gives a Google-only account the set-a-password path instead of a form it cannot use', () => {
    state.profile = { ...baseProfile, hasPassword: false, identities: [{ provider: 'google', email: baseProfile.email, createdAt: baseProfile.createdAt }] };
    const html = renderToStaticMarkup(<SettingsPage />);
    expect(html).toContain('Email me a link to set a password');
    expect(html).not.toMatch(/id="current-password"/);
    expect(html).toContain('No password');
  });

  it('shows linked Google identities and only offers linking when it is possible', () => {
    expect(renderToStaticMarkup(<SettingsPage />)).toContain('Link your Google account');

    state.profile = { ...baseProfile, identities: [{ provider: 'google', email: 'amina@gmail.test', createdAt: baseProfile.createdAt }] };
    const linked = renderToStaticMarkup(<SettingsPage />);
    expect(linked).toContain('amina@gmail.test');
    expect(linked).toContain('Linked');
    expect(linked).not.toContain('Link your Google account');

    state.profile = { ...baseProfile, identities: [] };
    state.google = { enabled: false, mode: 'google' };
    expect(renderToStaticMarkup(<SettingsPage />)).not.toContain('Link your Google account');

    state.google = { enabled: true, mode: 'google' };
    state.capabilities = { ready: true, can: () => false, isPlatform: true };
    expect(renderToStaticMarkup(<SettingsPage />)).not.toContain('Link your Google account');
  });

  it('labels the development stub honestly', () => {
    state.google = { enabled: true, mode: 'local-stub' };
    expect(renderToStaticMarkup(<SettingsPage />)).toContain('stubbed Google, not a real Google login');
  });

  it('offers organization controls by capability, not by role name', () => {
    state.user = { ...state.user, tenantSlug: 'fx-hotel-a', dashboardType: 'hotel' };
    expect(renderToStaticMarkup(<SettingsPage />)).not.toContain('Organization profile and verification');
    state.capabilities = { ready: true, can: (c: string) => c === 'core:tenant:update', isPlatform: false };
    expect(renderToStaticMarkup(<SettingsPage />)).toContain('Organization profile and verification');
  });
});
