import { AdminKycView } from '@/components/admin/admin-kyc-view';

export const metadata = { title: 'KYC Verification' };

/** `?tenant=<id>` narrows the review to one organization (linked from its detail page). */
export default function AdminKycPage({ searchParams }: { searchParams: { tenant?: string } }) {
  return <AdminKycView tenantId={typeof searchParams?.tenant === 'string' ? searchParams.tenant : undefined} />;
}
