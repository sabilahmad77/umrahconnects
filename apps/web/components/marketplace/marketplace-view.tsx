'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BadgeCheck, Building2, FileText, ShoppingBag, Star, Store } from 'lucide-react';
import { Button, LoadingState, QueryFailure } from '@/components/ui/system';
import { tablistKeys } from '@/components/ui/tablist';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useMarketplaceVendors } from '@/hooks/use-marketplace';
import { cn } from '@/lib/utils';
import { ListingBrowser } from './listing-browser';
import { CategoryIcon } from './listing-visual';
import { QuotesPanel, SellerWorkspace } from './seller-workspace';

type Tab = 'browse' | 'sellers' | 'mine' | 'quotes';

function VendorDirectory() {
  const { data: vendors, isLoading, error, refetch } = useMarketplaceVendors();
  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading) return <LoadingState label="Loading sellers…" />;
  if (!vendors?.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-600">
        <Store className="mx-auto mb-3 h-10 w-10 text-gray-300" aria-hidden="true" /> No sellers yet.
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Sellers">
      {vendors.map((v: any) => {
        const rating = Number(v.rating);
        return (
          <li key={v.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-emerald-600">
                <CategoryIcon category={v.type ?? ''} className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{v.name}</p>
                <p className="text-xs text-gray-600">
                  {v.city ?? 'City not set'} · {v._count?.listings ?? 0} published listing{v._count?.listings === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            {/* Prisma decimals arrive as strings; only show a rating that exists. */}
            {Number.isFinite(rating) && v.ratingCount > 0 && (
              <p className="flex items-center gap-1 text-xs text-gray-600">
                <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" aria-hidden="true" /> {rating.toFixed(1)} ({v.ratingCount})
              </p>
            )}
            {v.verified && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Verified
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * /marketplace — browse the catalogue, see sellers, and (with the listing
 * capabilities) manage the organization's own listings and quotes.
 */
export function MarketplaceView() {
  const router = useRouter();
  const params = useSearchParams();
  const { ready, can } = useCapabilities();
  const canManage = can('marketplace:listing:manage');

  const requested = (params?.get('tab') ?? 'browse') as Tab;
  const [tab, setTab] = useState<Tab>(requested);
  useEffect(() => setTab(requested), [requested]);

  const tabs: { key: Tab; label: string; icon: any; show: boolean }[] = [
    { key: 'browse', label: 'Browse', icon: ShoppingBag, show: true },
    { key: 'sellers', label: 'Sellers', icon: Building2, show: true },
    { key: 'mine', label: 'My listings', icon: Store, show: canManage },
    { key: 'quotes', label: 'Quotes', icon: FileText, show: canManage },
  ];
  const visible = tabs.filter((t) => t.show);
  // A tab the account cannot use is never rendered (fail closed while capabilities load).
  const active: Tab = visible.some((t) => t.key === tab) ? tab : 'browse';

  const select = (key: Tab) => {
    setTab(key);
    router.replace(key === 'browse' ? '/marketplace' : `/marketplace?tab=${key}`, { scroll: false });
  };

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
          <p className="mt-0.5 text-sm text-gray-600">Discover and connect with Umrah service providers</p>
        </div>
        {canManage && active !== 'mine' && (
          <Button onClick={() => select('mine')}>
            <Store className="h-4 w-4" aria-hidden="true" /> Manage my listings
          </Button>
        )}
      </div>

      <div role="tablist" {...tablistKeys()} aria-label="Marketplace sections" className="flex w-fit flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1">
        {visible.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => select(t.key)}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all',
              active === t.key ? 'bg-brand-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-700',
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {active === 'browse' && <ListingBrowser hrefFor={(l) => `/marketplace/${l.id}`} />}
        {active === 'sellers' && <VendorDirectory />}
        {active === 'mine' && ready && <SellerWorkspace canManage={canManage} />}
        {active === 'quotes' && ready && <QuotesPanel />}
      </div>
    </div>
  );
}
