import { GroupDetail } from '@/components/groups/group-detail';

export const metadata = { title: 'Group' };

export default function GroupDetailPage({ params }: { params: { id: string } }) {
  return <GroupDetail id={params.id} />;
}
