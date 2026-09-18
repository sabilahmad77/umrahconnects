import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ value: { user: null as any, isLoaded: false } }));
vi.mock('../components/providers/auth-provider', () => ({
  useAuthContext: () => auth.value,
  getDashboardPath: () => '/dashboard',
}));

import { RequireCapability } from '../components/auth/require-capability';
import { AccessDenied } from '../components/auth/access-denied';

const signedIn = (permissions: string[] | undefined) => ({
  isLoaded: true,
  user: {
    id: 'u1', email: 'u@example.test', tenantId: 't1', tenantName: 'Org', tenantSlug: 'org', tenantType: 'OPERATOR',
    roles: ['OPERATOR_STAFF'], dashboardType: 'operator', displayName: 'U', permissions, tenantStatus: 'ACTIVE',
  },
});

describe('RequireCapability', () => {
  const guarded = (props: Partial<React.ComponentProps<typeof RequireCapability>> = {}) =>
    renderToStaticMarkup(
      <RequireCapability all={['finance:payment:refund']} fallback={<span>no refund</span>} loading={<span>checking</span>} {...props}>
        <button>Refund</button>
      </RequireCapability>,
    );

  it('shows nothing privileged while the profile loads', () => {
    auth.value = { user: null, isLoaded: false };
    expect(guarded()).toBe('<span>checking</span>');
    auth.value = signedIn(undefined);
    expect(guarded()).toBe('<span>checking</span>');
  });

  it('renders the control only with the capability', () => {
    auth.value = signedIn(['finance:payment:read']);
    expect(guarded()).toBe('<span>no refund</span>');
    auth.value = signedIn(['finance:payment:read', 'finance:payment:refund']);
    expect(guarded()).toBe('<button>Refund</button>');
  });

  it('supports any-of and all-of together', () => {
    auth.value = signedIn(['a:b:c', 'x:y:z']);
    expect(guarded({ all: ['a:b:c'], any: ['q:q:q', 'x:y:z'] })).toBe('<button>Refund</button>');
    expect(guarded({ all: ['a:b:c', 'missing:one:here'], any: ['x:y:z'] })).toBe('<span>no refund</span>');
    expect(guarded({ all: [], any: ['q:q:q'] })).toBe('<span>no refund</span>');
  });
});

describe('AccessDenied', () => {
  it('explains the refusal and links back to a page the account can open', () => {
    const html = renderToStaticMarkup(<AccessDenied reason="platform-only" homeHref="/hotel-dashboard" />);
    expect(html).toContain('data-access="denied"');
    expect(html).toContain('Workspace access required');
    expect(html).toContain('Platform administration only');
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="/hotel-dashboard"');
  });

  it('distinguishes a missing permission from a page outside the workspace', () => {
    expect(renderToStaticMarkup(<AccessDenied reason="permission" homeHref="/" />)).toContain('Permission required');
    expect(renderToStaticMarkup(<AccessDenied reason="unknown" homeHref="/" />)).toContain('Page unavailable');
    expect(renderToStaticMarkup(<AccessDenied reason="organization-only" homeHref="/" />)).toContain('Organization workspace page');
  });
});
