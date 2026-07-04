import { DriverDetail } from '@/components/transport/driver-detail';
export const metadata = { title: 'Driver' };
export default function DriverDetailPage({ params }: { params: { id: string } }) {
  return <DriverDetail id={params.id} />;
}
