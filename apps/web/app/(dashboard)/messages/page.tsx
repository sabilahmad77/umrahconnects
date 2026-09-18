import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/system';
import { MessagesView } from '@/components/messages/messages-view';

export const metadata = { title: 'Messages' };

// MessagesView reads ?c=<conversation> (links from notifications and profiles).
export default function MessagesPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <MessagesView />
    </Suspense>
  );
}
