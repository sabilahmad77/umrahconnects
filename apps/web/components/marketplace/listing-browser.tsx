'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, MapPin, Search, SlidersHorizontal, Store } from 'lucide-react';
import { Button, Input, QueryFailure, Select } from '@/components/ui/system';
import { useListingSearch } from '@/hooks/use-marketplace';
import { cn } from '@/lib/utils';
import { ListingMedia } from './listing-visual';
import { categoryLabel, LISTING_CATEGORIES, LISTING_SORTS, listingPriceLabel, toCents } from './listing-rules';

const PAGE_SIZE = 12;

function useDebounced<T>(value: T, ms = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** A listing card: cover photo, real seller, city and price. */
export function ListingCard({ listing: l, href }: { listing: any; href: string }) {
  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-500/5"
    >
      <ListingMedia category={l.type ?? ''} image={Array.isArray(l.imageUrls) ? l.imageUrls[0] : undefined} priceLabel={listingPriceLabel(l)} verified={l.vendor?.verified} />
      <div className="p-4">
        <p className="line-clamp-1 font-heading text-[15px] font-bold leading-snug text-gray-900 transition-colors group-hover:text-brand-600">{l.name}</p>
        {l.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-600">{l.description}</p>}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-50 pt-3 text-xs text-gray-600">
          <span className="flex min-w-0 items-center gap-1.5">
            {l.vendor?.name && (
              <>
                <Store className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                <span className="truncate">{l.vendor.name}</span>
                {l.vendor.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Verified seller" />}
              </>
            )}
          </span>
          {l.city && (
            <span className="flex shrink-0 items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" /> {l.city}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * The marketplace catalogue: server-side search, category, city and price
 * filters, sorting and pagination. Used signed-in (/marketplace) and on the
 * public preview (/marketplace-preview); only the card links differ.
 */
export function ListingBrowser({ hrefFor, initialCategory = '' }: { hrefFor: (listing: any) => string; initialCategory?: string }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [city, setCity] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => setCategory(initialCategory), [initialCategory]);

  const q = useDebounced(search.trim());
  const c = useDebounced(city.trim());
  const minCents = minPrice.trim() ? toCents(minPrice) : undefined;
  const maxCents = maxPrice.trim() ? toCents(maxPrice) : undefined;
  const priceProblem =
    minCents === null || maxCents === null
      ? 'Enter prices as numbers with at most two decimals.'
      : minCents != null && maxCents != null && minCents > maxCents
        ? 'The minimum price is higher than the maximum.'
        : '';
  const debouncedMin = useDebounced(priceProblem ? undefined : minCents ?? undefined);
  const debouncedMax = useDebounced(priceProblem ? undefined : maxCents ?? undefined);

  useEffect(() => setPage(1), [q, category, c, debouncedMin, debouncedMax, sort]);

  const priced = debouncedMin != null || debouncedMax != null;
  const { data, isLoading, isFetching, error, refetch } = useListingSearch({
    page,
    limit: PAGE_SIZE,
    search: q || undefined,
    category: category || undefined,
    city: c || undefined,
    minPriceCents: debouncedMin,
    maxPriceCents: debouncedMax,
    currency: priced ? 'SAR' : undefined,
    sort,
  });
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const filtered = !!(q || category || c || priced);

  const clear = () => {
    setSearch('');
    setCategory('');
    setCity('');
    setMinPrice('');
    setMaxPrice('');
    setSort('newest');
  };

  return (
    <section aria-label="Marketplace listings" className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 focus-within:border-brand-300">
          <Search className="h-4 w-4 shrink-0 text-gray-600" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search listings"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, description, city or seller"
            className="flex-1 border-0 bg-transparent px-0 shadow-none focus:ring-0"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto">
            <option value="">All categories</option>
            {LISTING_CATEGORIES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto">
            {LISTING_SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button variant="secondary" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-3">
          <label className="block text-xs font-semibold text-gray-600">
            City
            <Input className="mt-1" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Makkah" />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Minimum price (SAR)
            <Input className="mt-1" inputMode="decimal" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0" />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Maximum price (SAR)
            <Input className="mt-1" inputMode="decimal" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="5000" />
          </label>
          {priceProblem && <p role="alert" className="text-xs text-red-700 sm:col-span-3">{priceProblem}</p>}
          {priced && <p className="text-xs text-gray-600 sm:col-span-3">Price filters show listings priced in SAR.</p>}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-600" aria-live="polite">
        <span>{isLoading ? 'Loading listings…' : `${data?.total ?? 0} listing${data?.total === 1 ? '' : 's'}${category ? ` in ${categoryLabel(category)}` : ''}`}</span>
        {filtered && (
          <Button variant="quiet" className="px-2 py-1 text-xs" onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>

      {error ? (
        <QueryFailure error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl border border-gray-200 bg-white" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <Store className="mx-auto mb-3 h-10 w-10 text-gray-300" aria-hidden="true" />
          <p className="text-sm text-gray-600">{filtered ? 'No listings match these filters.' : 'No listings have been published yet.'}</p>
        </div>
      ) : (
        <div className={cn('grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3', isFetching && 'opacity-70')}>
          {items.map((l: any) => (
            <ListingCard key={l.id} listing={l} href={hrefFor(l)} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Listing pages" className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-600">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </nav>
      )}
    </section>
  );
}
