'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Hotel, Bus, FileCheck2, Package, Star, MapPin, Lock, ArrowRight, Sparkles } from 'lucide-react';
import { PublicHeader, PublicFooter } from '@/components/public/public-chrome';
import { apiClient } from '@/lib/api';

const CATEGORIES = [
  { key: 'all', label: 'All', Icon: Sparkles, match: () => true },
  { key: 'hotels', label: 'Hotels', Icon: Hotel, match: (t: string) => t?.includes('hotel') || t?.includes('room') },
  { key: 'transport', label: 'Transport', Icon: Bus, match: (t: string) => t?.includes('transport') || t?.includes('vehicle') },
  { key: 'visa', label: 'Visa Services', Icon: FileCheck2, match: (t: string) => t?.includes('visa') || t?.includes('guide') },
  { key: 'packages', label: 'Packages', Icon: Package, match: (t: string) => t?.includes('package') },
];

const fmt = (cents?: number, cur = 'SAR') => cents != null ? `${cur} ${(cents / 100).toLocaleString()}` : 'On request';

export default function MarketplacePreviewPage() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    apiClient.get('/marketplace/listings?limit=60')
      .then((r) => { const d = r.data?.data; setListings((Array.isArray(d) ? d : d?.items) ?? []); })
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const c = CATEGORIES.find((x) => x.key === cat)!;
    return listings.filter((l) =>
      c.match((l.type ?? '').toLowerCase()) &&
      (!q || (l.name ?? '').toLowerCase().includes(q.toLowerCase())),
    );
  }, [listings, cat, q]);

  return (
    <div className="min-h-screen bg-ivory text-gray-900 flex flex-col">
      <PublicHeader />
      <main className="flex-1">
        {/* Guest banner */}
        <div className="bg-brand-600 text-white">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 py-2.5 flex items-center justify-center gap-2 text-[12.5px]">
            <Lock className="h-3.5 w-3.5 text-gold-300" />
            You&apos;re browsing as a guest. <Link href="/signup" className="font-semibold text-gold-300 hover:underline">Sign up</Link> or <Link href="/login" className="font-semibold text-gold-300 hover:underline">log in</Link> to book or contact providers.
          </div>
        </div>

        <section className="max-w-7xl mx-auto px-6 lg:px-8 pt-12 pb-6 text-center">
          <span className="inline-flex items-center gap-2 text-[10.5px] font-bold tracking-[0.14em] text-brand-700 bg-brand-50 px-3.5 py-1.5 rounded-full border border-brand-200">
            UMRAH MARKETPLACE
          </span>
          <h1 className="mt-5 font-heading text-4xl lg:text-[48px] font-extrabold text-brand-600 leading-tight">Find. Compare. Book.</h1>
          <p className="mt-4 text-[16px] text-gray-600 max-w-2xl mx-auto">Browse verified hotels, transport, visa services and complete Umrah packages — all in one marketplace.</p>
        </section>

        {/* Search + filters */}
        <section className="max-w-7xl mx-auto px-6 lg:px-8 pb-8">
          <div className="bg-white rounded-2xl border border-sandstone/60 p-3 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 flex items-center gap-2 px-3 bg-ivory rounded-xl border border-sandstone/60">
              <Search className="h-4 w-4 text-gray-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hotels, transport, visa, packages…" className="flex-1 bg-transparent py-2.5 text-sm outline-none" />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {CATEGORIES.map(({ key, label, Icon }) => (
                <button key={key} onClick={() => setCat(key)} className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors ${cat === key ? 'bg-brand-500 text-white' : 'bg-ivory text-gray-600 hover:bg-sandstone/40 border border-sandstone/60'}`}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Listings */}
        <section className="max-w-7xl mx-auto px-6 lg:px-8 pb-16">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-64 rounded-2xl bg-white border border-sandstone/60 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500">No listings match your search yet.</p>
              <Link href="/signup" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 mt-3">Sign up to list or request services <ArrowRight className="h-4 w-4" /></Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((l) => (
                <div key={l.id} className="bg-white rounded-2xl border border-sandstone/60 overflow-hidden hover:shadow-lg hover:shadow-brand-900/5 transition-all flex flex-col">
                  <div className="h-40 bg-gradient-to-br from-brand-500 to-brand-700 relative flex items-center justify-center">
                    {l.imageUrls?.[0]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={l.imageUrls[0]} alt={l.name} className="w-full h-full object-cover" />
                      : <Hotel className="h-10 w-10 text-white/60" />}
                    <span className="absolute top-3 left-3 text-[10px] font-bold tracking-wide text-brand-900 bg-gold-400 px-2 py-1 rounded-full uppercase">{(l.type ?? 'service').replace(/_/g, ' ')}</span>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-heading font-bold text-gray-900 leading-snug">{l.name ?? 'Umrah service'}</p>
                      <span className="flex items-center gap-0.5 text-[12px] text-gold-600 font-semibold shrink-0"><Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" /> 4.7</span>
                    </div>
                    {l.vendor?.displayName && <p className="text-[12px] text-gray-500 mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> {l.vendor.displayName}</p>}
                    <p className="text-[13px] text-gray-500 mt-2 line-clamp-2 flex-1">{l.description ?? 'Verified Umrah service available through the marketplace.'}</p>
                    <div className="mt-3 pt-3 border-t border-sandstone/50 flex items-center justify-between">
                      <p className="font-heading font-bold text-brand-600">{fmt(l.priceCents, l.currency)}</p>
                      <Link href="/login" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-white bg-brand-500 hover:bg-brand-600 px-3 py-1.5 rounded-lg transition-colors">
                        <Lock className="h-3 w-3" /> Book
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* CTA */}
        <section className="max-w-5xl mx-auto px-6 lg:px-8 pb-16">
          <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-3xl p-10 text-center text-white">
            <h2 className="font-heading text-2xl font-extrabold">Ready to book or contact a provider?</h2>
            <p className="text-white/75 mt-2 max-w-lg mx-auto">Create a free account to book services, message providers and manage your entire Umrah journey.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="bg-gold-500 hover:bg-gold-600 text-brand-900 px-6 py-3 rounded-xl font-semibold text-sm transition-colors">Get Started</Link>
              <Link href="/login" className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-semibold text-sm border border-white/20 transition-colors">Log in</Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
