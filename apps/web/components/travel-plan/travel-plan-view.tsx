'use client';

import Link from 'next/link';
import { Loader2, Users2, CalendarCheck2, FileCheck2, Bus, MapPin } from 'lucide-react';
import { useGroups, useCompliance } from '@/hooks/use-api';
import { useMyMarketplaceBookings } from '@/hooks/use-marketplace';
import { useMyRequests } from '@/hooks/use-platform';

export function TravelPlanView() {
  const { data: groupsData, isLoading: gl } = useGroups({ limit: 20 });
  const { data: bookings = [], isLoading: bl } = useMyMarketplaceBookings();
  const { data: requests, isLoading: rl } = useMyRequests();
  const { data: visas, isLoading: vl } = useCompliance({ limit: 20 });

  const groups = groupsData?.items ?? [];
  const myRequests = requests?.items ?? [];
  const visaApps = visas?.items ?? [];
  const isLoading = gl || bl || rl || vl;

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-gray-500 text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Building your travel plan…</div>;
  }

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My travel plan</h1>
        <p className="text-sm text-gray-500 mt-0.5">Everything tied to your upcoming trips, in one place.</p>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Groups" value={groups.length} icon={Users2} color="bg-saudi-50 text-saudi-700" />
        <Tile label="Bookings" value={bookings.length} icon={CalendarCheck2} color="bg-brand-50 text-brand-700" />
        <Tile label="Open requests" value={myRequests.length} icon={Bus} color="bg-blue-50 text-blue-700" />
        <Tile label="Visa apps" value={visaApps.length} icon={FileCheck2} color="bg-green-50 text-green-700" />
      </div>

      {/* Groups */}
      <Section title="My groups" icon={Users2} link="/groups">
        {groups.length === 0 ? <Empty>Join or create a group to coordinate trips.</Empty> : (
          <ul className="space-y-2">
            {groups.slice(0, 5).map((g: any) => (
              <li key={g.id}>
                <Link href={`/groups/${g.id}`} className="block bg-white rounded-xl border border-gray-100 p-3 hover:border-brand-200 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{g.name}</p>
                      <p className="text-[11px] text-gray-500">{g.tripType ?? 'GROUP'} · {g.enrolledCount ?? 0}/{g.capacity ?? '?'} members</p>
                    </div>
                    {(g.departureDate || g.returnDate) && (
                      <p className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {g.departureDate ? new Date(g.departureDate).toLocaleDateString() : '?'}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Bookings */}
      <Section title="Upcoming bookings" icon={CalendarCheck2} link="/my-bookings">
        {bookings.length === 0 ? <Empty>You have no marketplace bookings yet.</Empty> : (
          <ul className="space-y-2">
            {bookings.slice(0, 5).map((b: any) => (
              <li key={b.id}>
                <Link href={`/marketplace/${b.listing?.id ?? ''}`} className="block bg-white rounded-xl border border-gray-100 p-3 hover:border-brand-200 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{b.listing?.name ?? 'Booking'}</p>
                      <p className="text-[11px] text-gray-500">
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
      <Section title="Open requests" icon={Bus} link="/requests">
        {myRequests.length === 0 ? <Empty>No active marketplace requests.</Empty> : (
          <ul className="space-y-2">
            {myRequests.slice(0, 5).map((r: any) => (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="block bg-white rounded-xl border border-gray-100 p-3 hover:border-brand-200 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                      <p className="text-[11px] text-gray-500">{r.serviceType} · {r.status} · {r.offers?.length ?? 0} offers</p>
                    </div>
                    {r.budgetMaxCents && (
                      <p className="text-[11px] text-gray-500">Up to {r.currency} {(Number(r.budgetMaxCents) / 100).toLocaleString()}</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Visa apps */}
      <Section title="Visa applications" icon={FileCheck2} link="/compliance">
        {visaApps.length === 0 ? <Empty>No visa applications.</Empty> : (
          <ul className="space-y-2">
            {visaApps.slice(0, 3).map((v: any) => (
              <li key={v.id}>
                <Link href={`/compliance/${v.id}`} className="block bg-white rounded-xl border border-gray-100 p-3 hover:border-brand-200 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{v.type ?? 'Visa'} — {v.applicationNumber ?? '—'}</p>
                      <p className="text-[11px] text-gray-500">{v.regulatorySystem ?? '—'}</p>
                    </div>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{v.status}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Tile({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-1">{label}</p>
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
  return <p className="text-sm text-gray-500 bg-white rounded-xl border border-gray-100 px-3 py-4 text-center">{children}</p>;
}
