'use client';

import Link from 'next/link';
import { Loader2, Users2, CalendarCheck2, FileCheck2, Bus, MapPin } from 'lucide-react';
import { Alert, ErrorState , QueryFailure } from '@/components/ui/system';
import { useMyMarketplaceBookings } from '@/hooks/use-marketplace';
import { useMyRequests } from '@/hooks/use-platform';

export function TravelPlanView() {
  const { data: bookings = [], isLoading: bl, error: bookingError, refetch: retryBookings } = useMyMarketplaceBookings();
  const { data: requests, isLoading: rl, error: requestError, refetch: retryRequests } = useMyRequests();

  const myRequests = requests?.items ?? [];
  const isLoading = bl || rl;

  if (bookingError || requestError) return <QueryFailure error={bookingError || requestError} onRetry={() => { retryBookings(); retryRequests(); }} />;
  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-gray-600 text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Building your travel plan…</div>;
  }

  if (bookingError || requestError) return <ErrorState onRetry={() => { retryBookings(); retryRequests(); }} />;


  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My travel plan</h1>
        <p className="text-sm text-gray-600 mt-0.5">Your marketplace bookings and service requests.</p>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-3">

        <Tile label="Bookings" value={bookings.length} icon={CalendarCheck2} color="bg-brand-50 text-brand-700" />
        <Tile label="Requests" value={myRequests.length} icon={Bus} color="bg-blue-50 text-blue-700" />

      </div>

      {/* Bookings */}
      <Section title="My bookings" icon={CalendarCheck2} link="/my-bookings">
        {bookings.length === 0 ? <Empty>You have no marketplace bookings yet.</Empty> : (
          <ul className="space-y-2">
            {bookings.slice(0, 5).map((b: any) => (
              <li key={b.id}>
                <Link href={b.listing?.id ? `/marketplace/${b.listing.id}` : '/my-bookings'} className="block bg-white rounded-xl border border-gray-200 p-3 hover:border-brand-200 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{b.listing?.name ?? 'Booking'}</p>
                      <p className="text-xs text-gray-600">
                        {b.partySize} pax · {b.startDate ? new Date(b.startDate).toLocaleDateString() : '?'}
                        {b.endDate && ` → ${new Date(b.endDate).toLocaleDateString()}`}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-gray-900">{b.currency} {(Number(b.totalAmountCents) / 100).toLocaleString()}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Open requests */}
      <Section title="My requests" icon={Bus} link="/requests">
        {myRequests.length === 0 ? <Empty>You have no marketplace requests yet.</Empty> : (
          <ul className="space-y-2">
            {myRequests.slice(0, 5).map((r: any) => (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="block bg-white rounded-xl border border-gray-200 p-3 hover:border-brand-200 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                      <p className="text-xs text-gray-600">{r.serviceType} · {r.status} · {r.offers?.length ?? 0} offers</p>
                    </div>
                    {r.budgetMaxCents && (
                      <p className="text-xs text-gray-600">Up to {r.currency} {(Number(r.budgetMaxCents) / 100).toLocaleString()}</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Alert tone="info" title="Group and visa tracking"><p>Personal group membership and visa tracking are not available in this workspace yet. Contact your operator for your itinerary and application updates.</p></Alert>
    </div>
  );
}

function Tile({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-600 mt-1">{label}</p>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, link, children }: { title: string; icon: any; link: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <Icon className="h-4 w-4 text-brand-500" /> {title}
        </h2>
        <Link href={link} className="text-xs text-brand-500 hover:underline">View all</Link>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-600 bg-white rounded-xl border border-gray-200 px-3 py-4 text-center">{children}</p>;
}
