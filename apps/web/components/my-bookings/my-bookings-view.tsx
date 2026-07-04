'use client';

import Link from 'next/link';
import { Loader2, AlertCircle, CalendarCheck2, Wallet, Hotel, Bus, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMyMarketplaceBookings } from '@/hooks/use-marketplace';

export function MyBookingsView() {
  const { data: bookings = [], isLoading, error } = useMyMarketplaceBookings();

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My bookings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Bookings you've placed on marketplace listings.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : error ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-sm text-red-500">Failed to load bookings</p>
        </div>
      ) : bookings.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
          <CalendarCheck2 className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">No bookings yet</p>
          <Link href="/marketplace" className="text-xs text-brand-500 hover:underline mt-2 inline-block">Browse marketplace →</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b: any) => {
            const type = b.listing?.type ?? 'other';
            const Icon = type === 'transport_service' ? Bus : type === 'hotel_room' ? Hotel : ListChecks;
            return (
              <li key={b.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/marketplace/${b.listing?.id}`} className="flex items-start gap-3 flex-1 min-w-0 hover:text-brand-600">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{b.listing?.name ?? 'Listing'}</p>
                      <p className="text-[11px] text-gray-500">
                        {b.partySize} pax {b.startDate && `· ${new Date(b.startDate).toLocaleDateString()}`}
                        {b.endDate && ` → ${new Date(b.endDate).toLocaleDateString()}`}
                      </p>
                    </div>
                  </Link>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900 inline-flex items-center gap-1">
                      <Wallet className="h-3.5 w-3.5 text-gray-400" />
                      {b.currency} {(Number(b.totalAmountCents) / 100).toLocaleString()}
                    </p>
                    <div className="flex items-center gap-1 justify-end mt-1">
                      <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full',
                        b.status === 'PAID' || b.status === 'COMPLETED' ? 'bg-green-50 text-green-700' :
                        b.status === 'CONFIRMED' ? 'bg-blue-50 text-blue-700' :
                        b.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700' :
                        b.status === 'CANCELLED' || b.status === 'REFUNDED' ? 'bg-red-50 text-red-600' :
                        'bg-gray-100 text-gray-500',
                      )}>{b.status}</span>
                      <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full',
                        b.paymentStatus === 'PAID' ? 'bg-green-50 text-green-700' :
                        b.paymentStatus === 'PARTIAL' ? 'bg-yellow-50 text-yellow-700' :
                        b.paymentStatus === 'REFUNDED' ? 'bg-gray-100 text-gray-500' :
                        'bg-gray-100 text-gray-600',
                      )}>{b.paymentStatus}</span>
                    </div>
                  </div>
                </div>
                {b.notes && <p className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-50">{b.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
