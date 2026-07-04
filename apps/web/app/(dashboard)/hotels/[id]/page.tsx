import { HotelDetail } from '@/components/hotels/hotel-detail';
export const metadata = { title: 'Hotel' };
export default function HotelDetailPage({ params }: { params: { id: string } }) {
  return <HotelDetail id={params.id} />;
}
