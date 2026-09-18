/**
 * Capability checks for what the UI shows and offers.
 *
 * The server is the authority: every route re-checks its own capability and
 * returns 403 otherwise. These helpers only decide whether a control is worth
 * showing. They read the `permissions` list that `GET /auth/me` returns (the
 * catalogue keys in platform/api/src/modules/rbac/catalog.ts, for example
 * `finance:payment:refund`), never role names, so a custom role or a revoked
 * grant is reflected without a frontend change.
 *
 * They fail closed: while the profile is loading, or when it carries no
 * permission list, nothing privileged is offered.
 */
export type CapabilityList = readonly string[] | undefined | null;

export function hasCapability(permissions: CapabilityList, capability: string): boolean {
  return Array.isArray(permissions) && permissions.includes(capability);
}

export function hasAnyCapability(permissions: CapabilityList, capabilities: readonly string[]): boolean {
  return capabilities.some((capability) => hasCapability(permissions, capability));
}

export function hasAllCapabilities(permissions: CapabilityList, capabilities: readonly string[]): boolean {
  return capabilities.length > 0 && capabilities.every((capability) => hasCapability(permissions, capability));
}

/** Platform capabilities are only meaningful on a platform (Super Admin) account. */
export function hasPlatformCapability(permissions: CapabilityList): boolean {
  return Array.isArray(permissions) && permissions.some((p) => p.startsWith('platform:'));
}
