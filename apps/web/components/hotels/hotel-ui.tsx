'use client';

import { cn } from '@/lib/utils';
import { humanize } from '@/components/dashboard/workflow-ui';

export { sar, shortDate, humanize, ModalHeader, ModalFooter } from '@/components/dashboard/workflow-ui';

const BOOKING_TONE: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-800',
  CONFIRMED: 'bg-blue-50 text-blue-700',
  CHECKED_IN: 'bg-purple-50 text-purple-700',
  CHECKED_OUT: 'bg-gray-100 text-gray-700',
  COMPLETED: 'bg-green-50 text-green-800',
  CANCELLED: 'bg-red-50 text-red-700',
};

export function BookingStatusBadge({ status }: { status: string }) {
  return <span className={cn('text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap', BOOKING_TONE[status] ?? 'bg-gray-100 text-gray-700')}>{humanize(status)}</span>;
}

/** Payment state is read-only here: it follows the payments recorded in Finance. */
export function PaymentBadge({ status }: { status: string }) {
  const tone = status === 'PAID' ? 'bg-green-50 text-green-800' : status === 'PARTIAL' ? 'bg-yellow-50 text-yellow-800' : status === 'REFUNDED' ? 'bg-gray-100 text-gray-700' : 'bg-orange-50 text-orange-800';
  return <span title="Updated from payments recorded in Finance" className={cn('text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap', tone)}>{humanize(status)}</span>;
}
