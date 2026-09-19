import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/system';
import { SocialHub } from '@/components/social/social-hub';

export const metadata = { title: 'Social Hub' };

// SocialHub reads ?post= and ?tag= (links from notifications and hashtags).
export default function SocialPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SocialHub />
    </Suspense>
  );
}
