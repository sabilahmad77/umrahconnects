import { RouteDetail } from '@/components/transport/route-detail';
export const metadata = { title: 'Route' };
export default function RouteDetailPage({ params }: { params: { id: string } }) {
  return <RouteDetail id={params.id} />;
}
