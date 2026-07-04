import { PilgrimDetail } from '@/components/pilgrims/pilgrim-detail';
export const metadata = { title: 'Pilgrim' };
export default function PilgrimDetailPage({ params }: { params: { id: string } }) {
  return <PilgrimDetail id={params.id} />;
}
