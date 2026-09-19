import { CommunityGroupDetail } from '@/components/groups/community-group-detail';

export const metadata = { title: 'Group' };

export default function CommunityGroupPage({ params }: { params: { id: string } }) {
  return <CommunityGroupDetail id={params.id} />;
}
