'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { PublicFooter, PublicHeader } from '@/components/public/public-chrome';
import { ListingBrowser } from '@/components/marketplace/listing-browser';

/** Public marketing links use friendly category names; the API uses its ListingCategory values. */
const CATEGORY_ALIASES: Record<string, string> = {
  hotels: 'hotel_room',
  transport: 'transport_service',
  visa: 'visa_service',
  guides: 'guide_service',
  catering: 'catering',
  packages: 'other',
};

export default function MarketplacePreviewPage() {
  const [category, setCategory] = useState('');
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('category') ?? '';
    setCategory(CATEGORY_ALIASES[requested] ?? '');
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-ivory text-gray-900">
      <PublicHeader />
      <main id="public-main" tabIndex={-1} className="flex-1">
        <div className="bg-brand-600 text-white">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-6 py-2.5 text-[12.5px] lg:px-8">
            <Lock className="h-3.5 w-3.5 text-gold-300" aria-hidden="true" />
            You&apos;re browsing as a guest.{' '}
            <Link href="/signup" className="font-semibold text-gold-300 hover:underline">Sign up</Link> or{' '}
            <Link href="/login" className="font-semibold text-gold-300 hover:underline">log in</Link> to book or contact providers.
          </div>
        </div>

        <section className="mx-auto max-w-7xl px-6 pb-6 pt-12 text-center lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-[10.5px] font-bold tracking-[0.14em] text-brand-700">
            UMRAH MARKETPLACE
          </span>
          <h1 className="mt-5 font-heading text-4xl font-extrabold leading-tight text-brand-600 lg:text-[48px]">Find. Compare. Book.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-[16px] text-gray-600">
            Browse hotels, transport, visa services and complete Umrah packages — all in one marketplace.
          </p>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-8">
          <ListingBrowser initialCategory={category} hrefFor={(l) => `/marketplace-preview/${l.id}`} />
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-16 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 p-10 text-center text-white">
            <h2 className="font-heading text-2xl font-extrabold">Ready to book or contact a provider?</h2>
            <p className="mx-auto mt-2 max-w-lg text-white/75">
              Create a free account to book services, message providers and manage your entire Umrah journey.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="rounded-xl bg-gold-500 px-6 py-3 text-sm font-semibold text-brand-900 transition-colors hover:bg-gold-600">Get Started</Link>
              <Link href="/login" className="rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20">Log in</Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
