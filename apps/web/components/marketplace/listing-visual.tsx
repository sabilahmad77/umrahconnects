'use client';

import { useState } from 'react';
import {
  BedDouble, Bus, Compass, Package, Stamp, Store, UtensilsCrossed,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Meta = {
  Icon: any;
  label: string;
  gradient: string;
  photo: string; // curated category default photo
};

export function normalizeCategory(raw?: string): keyof typeof CATEGORY_META {
  const v = (raw ?? '').toUpperCase();
  if (v.includes('HOTEL') || v.includes('ROOM')) return 'HOTEL';
  if (v.includes('TRANSPORT') || v.includes('VEHICLE') || v.includes('COACH')) return 'TRANSPORT';
  if (v.includes('VISA')) return 'VISA';
  if (v.includes('CATER') || v.includes('FOOD')) return 'CATERING';
  if (v.includes('GUIDE') || v.includes('MUTAWIF')) return 'GUIDE';
  if (v.includes('PACKAGE') || v.includes('BUNDLE')) return 'PACKAGE';
  return 'OTHER';
}

// Curated, premium category photography (Unsplash CDN). Falls back to the
// branded gradient panel automatically if an image fails to load.
export const CATEGORY_META: Record<string, Meta> = {
  HOTEL:     { Icon: BedDouble,       label: 'Hotel',     gradient: 'from-[#0F3D37] to-[#1c5a4f]', photo: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80&auto=format&fit=crop' },
  TRANSPORT: { Icon: Bus,             label: 'Transport', gradient: 'from-[#2A7A6B] to-[#37998a]', photo: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&q=80&auto=format&fit=crop' },
  VISA:      { Icon: Stamp,           label: 'Visa',      gradient: 'from-[#112234] to-[#1e3a57]', photo: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80&auto=format&fit=crop' },
  CATERING:  { Icon: UtensilsCrossed, label: 'Catering',  gradient: 'from-[#C8A96B] to-[#dabd86]', photo: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80&auto=format&fit=crop' },
  GUIDE:     { Icon: Compass,         label: 'Guide',     gradient: 'from-[#216154] to-[#2A7A6B]', photo: 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=800&q=80&auto=format&fit=crop' },
  PACKAGE:   { Icon: Package,         label: 'Package',   gradient: 'from-[#A8894B] to-[#C8A96B]', photo: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80&auto=format&fit=crop' },
  OTHER:     { Icon: Store,           label: 'Listing',   gradient: 'from-[#0F3D37] to-[#2A7A6B]', photo: 'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?w=800&q=80&auto=format&fit=crop' },
};

export function ListingMedia({
  category, image, priceLabel, verified, className,
}: { category: string; image?: string; priceLabel?: string; verified?: boolean; className?: string }) {
  const key = normalizeCategory(category);
  const m = CATEGORY_META[key];
  const [errored, setErrored] = useState(false);
  const src = image || m.photo;
  const showImg = src && !errored;

  return (
    <div className={cn('relative h-44 w-full overflow-hidden', className)}>
      {showImg ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={m.label} onError={() => setErrored(true)} className="h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        </>
      ) : (
        <div className={cn('h-full w-full bg-gradient-to-br flex items-center justify-center relative', m.gradient)}>
          <span className="absolute -top-8 -right-6 w-28 h-28 rounded-full bg-white/10" />
          <span className="absolute -bottom-10 -left-6 w-32 h-32 rounded-full bg-white/[0.07]" />
          <m.Icon className="h-14 w-14 relative text-white" strokeWidth={1.5} />
        </div>
      )}

      {/* category pill (top-left) */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur shadow-sm">
        <m.Icon className="h-3.5 w-3.5 text-brand-600" />
        <span className="text-[11px] font-semibold text-brand-700 uppercase tracking-wide">{m.label}</span>
      </div>

      {/* verified (top-right) */}
      {verified && (
        <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-emerald-500/95 text-white text-[10px] font-semibold flex items-center gap-1 shadow-sm">
          ✓ Verified
        </div>
      )}

      {/* price (bottom-right) */}
      {priceLabel && (
        <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur shadow-md">
          <span className="text-sm font-heading font-bold text-brand-600">{priceLabel}</span>
        </div>
      )}
    </div>
  );
}

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const m = CATEGORY_META[normalizeCategory(category)];
  return <m.Icon className={cn('h-3.5 w-3.5', className)} />;
}
