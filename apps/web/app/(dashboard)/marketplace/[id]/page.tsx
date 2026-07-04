import { ListingDetail } from '@/components/marketplace/listing-detail';

export const metadata = { title: 'Marketplace listing' };

export default function ListingDetailPage({ params }: { params: { id: string } }) {
  return <ListingDetail id={params.id} />;
}
