'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/system';
import { cn } from '@/lib/utils';

/** Money from integer cents. */
export const sar = (cents?: number | null, currency = 'SAR') =>
  cents == null ? '—' : `${currency} ${(Number(cents) / 100).toLocaleString('en', { maximumFractionDigits: 2 })}`;

/** Stay dates are calendar days (stored at UTC midnight), so they are shown in UTC. */
export const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

export const humanize = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

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

export function ModalHeader({ title, onClose, busy }: { title: string; onClose: () => void; busy?: boolean }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <Button variant="quiet" type="button" aria-label="Close dialog" disabled={busy} onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-600" /></Button>
    </div>
  );
}

export function ModalFooter({ onClose, pending, cta }: { onClose: () => void; pending: boolean; cta: string }) {
  return (
    <div className="flex justify-end gap-2 mt-5">
      <Button variant="secondary" type="button" onClick={onClose} disabled={pending}>Cancel</Button>
      <Button type="submit" busy={pending}>{cta}</Button>
    </div>
  );
}
