import { BookingDetail } from '@/components/bookings/booking-detail';
export const metadata = { title: 'Booking' };
export default function BookingDetailPage({ params }: { params: { id: string } }) {
  return <BookingDetail id={params.id} />;
}
