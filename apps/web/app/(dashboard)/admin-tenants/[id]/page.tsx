import { AdminTenantDetail } from '@/components/admin/admin-tenant-detail';

export const metadata = { title: 'Tenant' };

export default function AdminTenantDetailPage({ params }: { params: { id: string } }) {
  return <AdminTenantDetail id={params.id} />;
}
