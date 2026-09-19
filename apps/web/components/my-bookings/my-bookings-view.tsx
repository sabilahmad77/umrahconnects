'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bus, CalendarCheck2, Hotel, ListChecks, Wallet } from 'lucide-react';
import { Button, Dialog, LoadingState, QueryFailure } from '@/components/ui/system';
import { cn } from '@/lib/utils';
import { useMyMarketplaceBookings } from '@/hooks/use-marketplace';
import {
  readReturn,
  withoutPaymentParam,
  withoutProviderParams,
} from '@/components/finance/checkout-machine';
import { formatAmount } from '@/components/finance/money';
import { BookingCheckout, CHECKOUT_PARAM } from './booking-checkout';

/** Bookings that still take money: unpaid or part-paid, and not closed. */
export function canPayBooking(b: { status?: string; paymentStatus?: string }): boolean {
  return (
    b.paymentStatus !== 'PAID' && !['CANCELLED', 'REFUNDED', 'COMPLETED'].includes(String(b.status))
  );
}

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-800',
  CONFIRMED: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-red-50 text-red-700',
  REFUNDED: 'bg-gray-100 text-gray-700',
};
const PAYMENT_TONE: Record<string, string> = {
  PAID: 'bg-green-50 text-green-700',
  PARTIAL: 'bg-yellow-50 text-yellow-800',
  UNPAID: 'bg-gray-100 text-gray-700',
  REFUNDED: 'bg-gray-100 text-gray-700',
};
const PAYMENT_LABEL: Record<string, string> = {
  PAID: 'Paid',
  PARTIAL: 'Part paid',
  UNPAID: 'Unpaid',
  REFUNDED: 'Refunded',
};

interface CheckoutTarget {
  bookingId?: string;
  paymentId?: string;
  redirected?: boolean;
  title: string;
}

export function MyBookingsView() {
  const qc = useQueryClient();
  const { data: bookings = [], isLoading, error, refetch } = useMyMarketplaceBookings();
  const [checkout, setCheckout] = useState<CheckoutTarget | null>(null);

  // A reload or a return from a bank page carries the attempt id: reopen it from the server.
  useEffect(() => {
    const { paymentId, redirected } = readReturn(window.location.search, CHECKOUT_PARAM);
    // The provider appends the client secret to the return URL; it must not stay in the address bar.
    const cleaned = withoutProviderParams(window.location.search);
    if (cleaned !== window.location.search) {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${cleaned}`,
      );
    }
    if (paymentId) setCheckout({ paymentId, redirected, title: 'Booking payment' });
  }, []);

  const refreshBookings = () => {
    void qc.invalidateQueries({ queryKey: ['marketplace', 'my-bookings'] });
  };

  const closeCheckout = () => {
    setCheckout(null);
    // The attempt stays open on the server and resumes next time; only the page forgets it.
    const next = withoutPaymentParam(window.location.search, CHECKOUT_PARAM);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${next}`);
    refreshBookings();
  };

  if (error) return <QueryFailure error={error} onRetry={() => void refetch()} />;
  return (
    <div className="space-y-5 pb-6">
      <Dialog
        open={!!checkout}
        onOpenChange={(open) => {
          if (!open) closeCheckout();
        }}
        title={checkout?.title ?? 'Booking payment'}
      >
        {checkout && (
          <BookingCheckout
            listingBookingId={checkout.bookingId}
            resumePaymentId={checkout.paymentId}
            redirected={checkout.redirected}
            onOutcome={refreshBookings}
          />
        )}
      </Dialog>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">My bookings</h1>
        <p className="mt-0.5 text-sm text-gray-600">
          Bookings you’ve placed on marketplace listings.
        </p>
      </div>

      {isLoading ? (
        <LoadingState label="Loading your bookings…" />
      ) : bookings.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-20 text-center">
          <CalendarCheck2 aria-hidden="true" className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-sm text-gray-600">No bookings yet</p>
          <Link
            href="/marketplace"
            className="text-brand-600 mt-2 inline-block text-xs hover:underline"
          >
            Browse the marketplace →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b: any) => (
            <BookingCard
              key={b.id}
              booking={b}
              onPay={() =>
                setCheckout({
                  bookingId: b.id,
                  title: `Pay for ${b.listing?.name ?? 'your booking'}`,
                })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingCard({ booking: b, onPay }: { booking: any; onPay: () => void }) {
  const [open, setOpen] = useState(false);
  const type = b.listing?.type ?? 'other';
  const Icon = type === 'transport_service' ? Bus : type === 'hotel_room' ? Hotel : ListChecks;
  const payable = canPayBooking(b);
  const detailsId = `booking-${b.id}-details`;
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="bg-brand-50 text-brand-700 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <Icon aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">
              {b.listing?.name ?? 'Listing'}
            </p>
            <p className="text-xs text-gray-600">
              {b.partySize} {b.partySize === 1 ? 'person' : 'people'}
              {b.startDate && ` · ${new Date(b.startDate).toLocaleDateString()}`}
              {b.endDate && ` → ${new Date(b.endDate).toLocaleDateString()}`}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="inline-flex items-center gap-1 text-sm font-bold text-gray-900">
            <Wallet aria-hidden="true" className="h-3.5 w-3.5 text-gray-600" />
            {formatAmount(b.totalAmountCents, b.currency)}
          </p>
          <div className="mt-1 flex items-center justify-end gap-1">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                STATUS_TONE[b.status] ?? 'bg-gray-100 text-gray-700',
              )}
            >
              {String(b.status ?? '—').replace(/_/g, ' ')}
            </span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                PAYMENT_TONE[b.paymentStatus] ?? 'bg-gray-100 text-gray-700',
              )}
              data-testid="booking-payment-status"
            >
              {PAYMENT_LABEL[b.paymentStatus] ?? b.paymentStatus}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {payable && (
          <Button variant="secondary" onClick={onPay}>
            {b.paymentStatus === 'PARTIAL' ? 'Pay the balance' : 'Pay booking'}
          </Button>
        )}
        <Button
          variant="quiet"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide details' : 'Details'}
        </Button>
      </div>

      {open && (
        <dl
          id={detailsId}
          className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-gray-100 pt-3 text-sm sm:grid-cols-4"
        >
          <Detail label="Reference" value={String(b.id).slice(0, 8).toUpperCase()} />
          <Detail
            label="Booked on"
            value={b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '—'}
          />
          <Detail label="Total" value={formatAmount(b.totalAmountCents, b.currency)} />
          <Detail label="Payment" value={PAYMENT_LABEL[b.paymentStatus] ?? b.paymentStatus} />
          {b.notes && <Detail label="Notes" value={b.notes} wide />}
          <p className="col-span-2 text-xs text-gray-600 sm:col-span-4">
            Changes and cancellations are handled by the provider.{' '}
            {b.listing?.id ? (
              <Link
                href={`/marketplace/${b.listing.id}`}
                className="text-brand-600 hover:underline"
              >
                Contact them from the listing page
              </Link>
            ) : (
              'Contact them from the listing page'
            )}
            ; a refund they issue appears here automatically.
          </p>
        </dl>
      )}
    </li>
  );
}

function Detail({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'col-span-2 sm:col-span-4' : undefined}>
      <dt className="text-xs font-semibold text-gray-600">{label}</dt>
      <dd className="text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}
