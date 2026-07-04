import { InvoiceDetail } from '@/components/finance/invoice-detail';

export const metadata = { title: 'Invoice' };

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  return <InvoiceDetail id={params.id} />;
}
