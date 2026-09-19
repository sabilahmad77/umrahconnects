import { Suspense } from 'react';
import { HotelBookingsView } from '@/components/hotels/hotel-bookings-view';
import { LoadingState } from '@/components/ui/system';

export const metadata = { title: 'Hotel Bookings' };

export default function HotelBookingsPage() {
  // The view reads ?hotelId= from the URL, which needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<LoadingState label="Loading bookings…" />}>
      <HotelBookingsView />
    </Suspense>
  );
}
