'use client';

import { useMemo } from 'react';
import { useAuthContext } from '@/components/providers/auth-provider';
import { hasAllCapabilities, hasAnyCapability, hasCapability, hasPlatformCapability } from '@/lib/capabilities';

/**
 * The signed-in user's capabilities, from `GET /auth/me`.
 *
 * `ready` is false until the profile has loaded; every check returns false
 * until then, so privileged controls never flash into view and then vanish.
 * Use `ready` to tell "still loading" apart from "not allowed" when rendering
 * a denied state.
 */
export function useCapabilities() {
  const { user, isLoaded } = useAuthContext();
  const permissions = user?.permissions;

  return useMemo(() => {
    const ready = isLoaded && !!user && Array.isArray(permissions);
    return {
      ready,
      permissions: ready ? (permissions as string[]) : [],
      can: (capability: string) => ready && hasCapability(permissions, capability),
      canAny: (...capabilities: string[]) => ready && hasAnyCapability(permissions, capabilities),
      canAll: (...capabilities: string[]) => ready && hasAllCapabilities(permissions, capabilities),
      isPlatform: ready && hasPlatformCapability(permissions),
    };
  }, [isLoaded, user, permissions]);
}
