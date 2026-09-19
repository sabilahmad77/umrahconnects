'use client';

import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import { LoadingState, QueryFailure } from '@/components/ui/system';
import { PublicFooter, PublicHeader } from '@/components/public/public-chrome';
import { useMarketplaceListing } from '@/hooks/use-marketplace';
import { Details, Gallery, PriceCard, SellerCard } from '@/components/marketplace/listing-detail';
import { categoryLabel, listingPriceLabel } from '@/components/marketplace/listing-rules';

/** Public (guest) view of a published listing; booking and inquiries need an account. */
export default function MarketplacePreviewListingPage({ params }: { params: { id: string } }) {
  const { data: listing, isLoading, error, refetch } = useMarketplaceListing(params.id);
  const notFound = (error as any)?.response?.status === 404 || (error as any)?.response?.status === 400;
  const returnTo = encodeURIComponent(`/marketplace/${params.id}`);

  return (
    <div className="flex min-h-screen flex-col bg-ivory text-gray-900">
      <PublicHeader />
      <main id="public-main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-6 py-10 lg:px-8">
        <Link href="/marketplace-preview" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All listings
        </Link>
        {isLoading ? (
          <LoadingState label="Loading listing…" />
        ) : notFound || !listing ? (
          error && !notFound ? (
            <QueryFailure error={error} onRetry={() => refetch()} />
          ) : (
            <p className="rounded-xl border border-sandstone/60 bg-white py-16 text-center text-sm text-gray-700">This listing is not available.</p>
          )
        ) : (
          <>
            <div>
              <h1 className="font-heading text-3xl font-bold text-brand-600">{listing.name}</h1>
              <p className="mt-1 text-sm text-gray-600">
                {categoryLabel(listing.type)}
                {listing.vendor?.name ? ` · by ${listing.vendor.name}` : ''}
                {listing.city ? ` · ${listing.city}` : ''} · {listingPriceLabel(listing)}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <Gallery listing={listing} />
                <Details listing={listing} />
              </div>
              <div className="space-y-3">
                <PriceCard listing={listing} />
                <SellerCard vendor={listing.vendor} city={listing.city} />
                <div className="rounded-xl border border-sandstone/60 bg-white p-5 text-sm">
                  <p className="flex items-center gap-1.5 font-semibold text-gray-900">
                    <Lock className="h-4 w-4 text-brand-600" aria-hidden="true" /> Book or ask the seller
                  </p>
                  <p className="mt-1 text-gray-600">Log in to request a booking or send an inquiry.</p>
                  <div className="mt-3 flex gap-2">
                    <Link href={`/login?returnTo=${returnTo}`} className="uc-button uc-button-primary">Log in</Link>
                    <Link href="/signup" className="uc-button uc-button-secondary">Sign up</Link>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
