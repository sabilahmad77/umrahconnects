'use client';

import { Lock } from 'lucide-react';

/**
 * Says plainly that the current account can look but not change, and which
 * grant would change that — instead of showing controls the server would refuse.
 */
export function ReadOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs text-gray-700">
      <Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />
      <span>{children}</span>
    </p>
  );
}
