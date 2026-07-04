import { VisaDetail } from '@/components/compliance/visa-detail';

export const metadata = { title: 'Visa Application' };

export default function VisaDetailPage({ params }: { params: { id: string } }) {
  return <VisaDetail id={params.id} />;
}
