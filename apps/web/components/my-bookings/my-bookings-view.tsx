'use client';
import { QueryFailure } from '@/components/ui/system';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Dialog } from '@/components/ui/system';
import { BookingCheckout } from './booking-checkout';
import { Loader2, AlertCircle, CalendarCheck2, Wallet, Hotel, Bus, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { useCancelMarketplaceBooking, useMyMarketplaceBookings } from '@/hooks/use-marketplace';

/** The server lets a customer cancel only a pending booking with no payment recorded or in progress. */
const customerMayCancel = (b: any) => b.status === 'PENDING' && b.paymentStatus === 'UNPAID';

export function MyBookingsView() {
  const [selectedBooking,setSelectedBooking]=useState<string>();
  const [cancelling, setCancelling] = useState<any>();
  const cancel = useCancelMarketplaceBooking();
  const [returnCheckout]=useState(()=> typeof window!=='undefined' && new URLSearchParams(window.location.search).has('checkout'));
  const { data: bookings = [], isLoading, error , refetch: retryMyMarketplaceBookings} = useMyMarketplaceBookings();

  if (error) return <QueryFailure error={error} onRetry={() => { retryMyMarketplaceBookings(); }} />;
  return (
    <div className="space-y-5 pb-6">
      {returnCheckout && <BookingCheckout onChanged={()=>{void retryMyMarketplaceBookings();}} />}
      <Dialog open={!!selectedBooking} onOpenChange={open=>{if(!open)setSelectedBooking(undefined);}} title="Booking payment"><BookingCheckout bookingId={selectedBooking} onChanged={()=>{void retryMyMarketplaceBookings();}} /></Dialog>
      <Dialog open={!!cancelling} onOpenChange={open=>{if(!open && !cancel.isPending)setCancelling(undefined);}} title="Cancel this booking?" description={cancelling ? `${cancelling.listing?.name ?? 'Listing'} · ${cancelling.partySize} pax` : undefined}>
        <p className="text-sm text-gray-600">The provider is told that you cancelled. Nothing has been paid, so there is nothing to refund.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" disabled={cancel.isPending} onClick={()=>setCancelling(undefined)}>Keep booking</Button>
          <Button variant="danger" busy={cancel.isPending} onClick={async()=>{
            try {
              await cancel.mutateAsync(cancelling.id);
              toast.success('Booking cancelled');
              setCancelling(undefined);
            } catch (e) {
              // e.g. a payment was started meanwhile, or the provider already confirmed.
              toast.error(apiErrorMessage(e, 'The booking could not be cancelled.'));
              setCancelling(undefined);
              void retryMyMarketplaceBookings();
            }
          }}>Cancel booking</Button>
        </div>
      </Dialog>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My bookings</h1>
        <p className="text-sm text-gray-600 mt-0.5">Bookings you’ve placed on marketplace listings.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-600 text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : bookings.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-xl border border-gray-200">
          <CalendarCheck2 className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-600">No bookings yet</p>
          <Link href="/marketplace" className="text-xs text-brand-500 hover:underline mt-2 inline-block">Browse marketplace →</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b: any) => {
            const type = b.listing?.type ?? 'other';
            const Icon = type === 'transport_service' ? Bus : type === 'hotel_room' ? Hotel : ListChecks;
            return (
              <li key={b.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/marketplace/${b.listing?.id}`} className="flex items-start gap-3 flex-1 min-w-0 hover:text-brand-600">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{b.listing?.name ?? 'Listing'}</p>
                      <p className="text-xs text-gray-600">
                        {b.partySize} pax {b.startDate && `· ${new Date(b.startDate).toLocaleDateString()}`}
                        {b.endDate && ` → ${new Date(b.endDate).toLocaleDateString()}`}
                      </p>
                    </div>
                  </Link>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900 inline-flex items-center gap-1">
                      <Wallet className="h-3.5 w-3.5 text-gray-600" />
                      {b.currency} {(Number(b.totalAmountCents) / 100).toLocaleString()}
                    </p>
                    <div className="flex items-center gap-1 justify-end mt-1">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
                        b.status === 'PAID' || b.status === 'COMPLETED' ? 'bg-green-50 text-green-700' :
                        b.status === 'CONFIRMED' ? 'bg-blue-50 text-blue-700' :
                        b.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700' :
                        b.status === 'CANCELLED' || b.status === 'REFUNDED' ? 'bg-red-50 text-red-600' :
                        'bg-gray-100 text-gray-600',
                      )}>{b.status}</span>
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
                        b.paymentStatus === 'PAID' ? 'bg-green-50 text-green-700' :
                        b.paymentStatus === 'PARTIAL' ? 'bg-yellow-50 text-yellow-700' :
                        b.paymentStatus === 'REFUNDED' ? 'bg-gray-100 text-gray-600' :
                        'bg-gray-100 text-gray-600',
                      )}>{b.paymentStatus}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {b.paymentStatus!=='PAID' && !['CANCELLED','REFUNDED','COMPLETED'].includes(b.status) && <Button variant="secondary" onClick={()=>setSelectedBooking(b.id)}>Pay booking</Button>}
                  {customerMayCancel(b) && <Button variant="quiet" className="text-red-700" onClick={()=>setCancelling(b)}>Cancel booking</Button>}
                </div>
                {b.notes && <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-50">{b.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
