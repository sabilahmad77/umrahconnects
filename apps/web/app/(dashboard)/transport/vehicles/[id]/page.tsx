import { VehicleDetail } from '@/components/transport/vehicle-detail';
export const metadata = { title: 'Vehicle' };
export default function VehicleDetailPage({ params }: { params: { id: string } }) {
  return <VehicleDetail id={params.id} />;
}
