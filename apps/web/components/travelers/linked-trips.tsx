'use client';

import { useState } from 'react';
import { Building2, CalendarCheck2, FileCheck2, Link2, Users2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, Dialog, LoadingState, QueryFailure } from '@/components/ui/system';
import { humanizeStatus } from '@/lib/statuses';
import { apiErrorMessage } from '@/lib/api-error';
import { useMyTrips, useUnlinkTrip, type TravelerTrip } from '@/hooks/use-traveler-links';
import { formatDate, formatDateRange, tripStatusTone } from './link-presentation';

/**
 * "Trips from your travel organizers" on the traveler's travel plan (P06,
 * D-022). Shows the real booking, group and visa status of exactly the records
 * the traveler accepted an invitation for — status only — and lets them unlink.
 */
export function LinkedTrips() {
  const { data: trips, isLoading, error, refetch } = useMyTrips();
  const unlink = useUnlinkTrip();
  const [target, setTarget] = useState<TravelerTrip | null>(null);

  const confirmUnlink = async () => {
    if (!target) return;
    try {
      await unlink.mutateAsync(target.linkId);
      toast.success(`Unlinked from ${target.organization.name}.`);
      setTarget(null);
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The trip could not be unlinked.'));
    }
  };

  return (
    <section aria-labelledby="linked-trips-title" className="space-y-3">
      <h2 id="linked-trips-title" className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
        <Link2 aria-hidden="true" className="h-4 w-4 text-brand-500" /> Trips from your travel organizers
      </h2>
      {error ? (
        <QueryFailure error={error} onRetry={() => { void refetch(); }} />
      ) : isLoading || !trips ? (
        <Card><LoadingState label="Loading your linked trips…" /></Card>
      ) : trips.length === 0 ? (
        <LinkedTripsEmpty />
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => (
            <li key={trip.linkId}><TripCard trip={trip} busy={unlink.isPending} onUnlink={() => setTarget(trip)} /></li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!target}
        onOpenChange={(open) => { if (!open && !unlink.isPending) setTarget(null); }}
        title="Unlink this trip?"
        description={target ? `You will stop seeing the status ${target.organization.name} holds for ${target.traveler.name}. They will need to invite you again to relink.` : undefined}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={unlink.isPending} onClick={() => setTarget(null)}>Keep linked</Button>
          <Button variant="danger" busy={unlink.isPending} onClick={() => { void confirmUnlink(); }}>Unlink</Button>
        </div>
      </Dialog>
    </section>
  );
}

/** Before any link exists: how linking works, honestly. Pure. */
export function LinkedTripsEmpty() {
  return (
    <Card className="space-y-2">
      <p className="text-sm font-semibold text-gray-900">No trips are linked to your account yet</p>
      <p className="text-sm text-gray-600">
        If a travel organizer manages your Umrah or Hajj trip on Umrah Connect, they can email you an invitation.
        Open that link while signed in to this account — its email address must be verified and must be the one the
        invitation was sent to. Your booking, group and visa status then appear here.
      </p>
      <p className="text-sm text-gray-600">Nothing is linked automatically, even when your name or email matches a booking.</p>
    </Card>
  );
}

/** One linked trip, labelled with the organization that holds it. Pure. */
export function TripCard({ trip, busy, onUnlink }: { trip: TravelerTrip; busy?: boolean; onUnlink: () => void }) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand-700"><Building2 aria-hidden="true" className="h-4 w-4" /> {trip.organization.name}</p>
          <p className="mt-1 text-base font-semibold text-gray-900">{trip.traveler.name}</p>
          <p className="text-xs text-gray-600">Linked since {formatDate(trip.linkedAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tripStatusTone(trip.traveler.status)}>{humanizeStatus(trip.traveler.status)}</Badge>
          <Button variant="quiet" disabled={busy} onClick={onUnlink}>Unlink</Button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900"><CalendarCheck2 aria-hidden="true" className="h-4 w-4 text-brand-500" /> Booking</h3>
        {trip.bookings.length === 0 ? (
          <p className="text-sm text-gray-600">No booking has been recorded for you yet.</p>
        ) : (
          <ul className="space-y-2">
            {trip.bookings.map((b) => (
              <li key={b.bookingRef} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{b.package?.name ?? 'Booking'} <span className="text-xs font-normal text-gray-600">· {b.bookingRef}</span></p>
                  <Badge tone={tripStatusTone(b.status)}>{humanizeStatus(b.status)}</Badge>
                </div>
                {formatDateRange(b.departureDate, b.returnDate) && <p className="mt-1 text-xs text-gray-600">{formatDateRange(b.departureDate, b.returnDate)}</p>}
                {b.group && (
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-600"><Users2 aria-hidden="true" className="h-3.5 w-3.5" /> Group: {b.group.name} · {humanizeStatus(b.group.status)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900"><FileCheck2 aria-hidden="true" className="h-4 w-4 text-brand-500" /> Visa</h3>
        {trip.visas.length === 0 ? (
          <p className="text-sm text-gray-600">No visa application has been started for you yet.</p>
        ) : (
          <ul className="space-y-2">
            {trip.visas.map((v, index) => (
              <li key={`${v.status}-${v.updatedAt}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-3">
                <div className="text-sm">
                  <p className="font-medium text-gray-900">{v.visaType ? `${humanizeStatus(v.visaType)} visa` : 'Visa application'}</p>
                  <p className="text-xs text-gray-600">
                    {v.submittedAt ? `Submitted ${formatDate(v.submittedAt)}` : 'Not submitted yet'}
                    {v.decidedAt ? ` · decided ${formatDate(v.decidedAt)}` : ''}
                    {v.validUntil ? ` · valid until ${formatDate(v.validUntil)}` : ''}
                  </p>
                </div>
                <Badge tone={tripStatusTone(v.status)}>{humanizeStatus(v.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
