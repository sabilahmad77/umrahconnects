import { RequestDetail } from '@/components/requests/request-detail';

export const metadata = { title: 'Marketplace Request' };

export default function RequestDetailPage({ params }: { params: { id: string } }) {
  return <RequestDetail id={params.id} />;
}
