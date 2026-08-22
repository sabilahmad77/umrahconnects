import { VisaRequestDetail } from '@/components/compliance/visa-request-detail';

export const metadata = { title: 'Visa Service Request' };

export default function VisaRequestDetailPage({ params }: { params: { id: string } }) {
  return <VisaRequestDetail id={params.id} />;
}
