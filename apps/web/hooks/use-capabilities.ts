'use client';

import { useMemo } from 'react';
import { useAuthContext } from '@/components/providers/auth-provider';
import { hasAllCapabilities, hasAnyCapability, hasCapability } from '@/lib/capabilities';
import {
  canOpenRoute,
  isPendingOrganization,
  isPlatformAccount,
  landingPathFor,
  workspaceKind,
  type WorkspaceKind,
} from '@/lib/workspace-access';

/**
 * The signed-in user's capabilities, from `GET /auth/me`.
 *
 * `ready` is false until the profile has loaded; every check returns false
 * until then, so privileged controls never flash into view and then vanish.
 * Use `ready` to tell "still loading" apart from "not allowed" when rendering
 * a denied state.
 *
 * The profile is refreshed when the window regains focus and after any 403
 * (components/auth/capability-sync.tsx), so these answers follow grants that
 * change on the server without a reload.
 */
export function useCapabilities() {
  const { user, isLoaded } = useAuthContext();
  const permissions = user?.permissions;

  return useMemo(() => {
    const ready = isLoaded && !!user && Array.isArray(permissions);
    const subject = ready ? user : null;
    return {
      ready,
      permissions: ready ? (permissions as string[]) : [],
      can: (capability: string) => ready && hasCapability(permissions, capability),
      canAny: (...capabilities: string[]) => ready && hasAnyCapability(permissions, capabilities),
      canAll: (...capabilities: string[]) => ready && hasAllCapabilities(permissions, capabilities),
      /** Whether a workspace route opens for this account (lib/workspace-access.ts). */
      canOpen: (path: string) => ready && canOpenRoute(subject, path),
      /** A Super Admin account of the PLATFORM organization. */
      isPlatform: ready && isPlatformAccount(subject),
      /** The organization exists but has not passed KYC review. */
      pending: ready && isPendingOrganization(subject),
      kind: (subject ? workspaceKind(subject) : null) as WorkspaceKind | null,
      landingPath: subject ? landingPathFor(subject) : null,
    };
  }, [isLoaded, user, permissions]);
}
