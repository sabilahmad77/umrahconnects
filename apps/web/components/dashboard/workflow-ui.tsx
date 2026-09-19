'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/system';

/*
 * Small shared pieces for the business-role workflow screens (hotels, transport,
 * visa): money and date formatting and the modal header/footer the domain
 * dialogs use, so every form closes, cancels and submits the same way.
 */

/** Money from integer cents. */
export const sar = (cents?: number | null, currency = 'SAR') =>
  cents == null ? '—' : `${currency} ${(Number(cents) / 100).toLocaleString('en', { maximumFractionDigits: 2 })}`;

/** Calendar days (stored at UTC midnight) are shown in UTC so they never shift by a day. */
export const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

/** Moments (departures, uploads) are shown in the viewer's local time. */
export const dateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const humanize = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

export function ModalHeader({ title, onClose, busy }: { title: string; onClose: () => void; busy?: boolean }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <Button variant="quiet" type="button" aria-label="Close dialog" disabled={busy} onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-600" /></Button>
    </div>
  );
}

export function ModalFooter({ onClose, pending, cta, danger }: { onClose: () => void; pending: boolean; cta: string; danger?: boolean }) {
  return (
    <div className="flex justify-end gap-2 mt-5">
      <Button variant="secondary" type="button" onClick={onClose} disabled={pending}>Cancel</Button>
      <Button type="submit" variant={danger ? 'danger' : 'primary'} busy={pending}>{cta}</Button>
    </div>
  );
}
