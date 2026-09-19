import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/system';
import { MarketplaceView } from '@/components/marketplace/marketplace-view';

export const metadata = { title: 'Marketplace' };

// MarketplaceView reads ?tab= with useSearchParams, which needs a Suspense boundary.
export default function MarketplacePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading marketplace…" />}>
      <MarketplaceView />
    </Suspense>
  );
}
