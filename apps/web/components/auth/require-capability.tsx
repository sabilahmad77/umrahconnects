'use client';

import type { ReactNode } from 'react';
import { useCapabilities } from '@/hooks/use-capabilities';

/**
 * Renders `children` only when the signed-in account holds the capabilities.
 *
 *   <RequireCapability all={['finance:payment:refund']}>
 *     <Button onClick={refund}>Refund</Button>
 *   </RequireCapability>
 *
 * While the profile is loading it renders `loading` (nothing by default), so a
 * privileged control never appears and then disappears. Without the
 * capability it renders `fallback` (nothing by default). The API still
 * refuses the action on its own; this only avoids offering it.
 */
export function RequireCapability({
  any,
  all,
  children,
  fallback = null,
  loading = null,
}: {
  any?: string[];
  all?: string[];
  children: ReactNode;
  fallback?: ReactNode;
  loading?: ReactNode;
}) {
  const { ready, canAll, canAny } = useCapabilities();
  if (!ready) return <>{loading}</>;
  const allowed = (!all?.length || canAll(...all)) && (!any?.length || canAny(...any));
  return <>{allowed ? children : fallback}</>;
}
