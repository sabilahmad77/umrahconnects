'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight, ChevronDown, Mail, Linkedin, Youtube, Twitter, Instagram, Facebook,
  Building2, Hotel, Bus, FileCheck2, Wallet, UserRound, Shield,
  BookOpen, LifeBuoy, Code2, Map,
} from 'lucide-react';

// ── Shared brandmark (identical to landing) ──────────────────────────────────
export function Brandmark({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${light ? 'bg-white/10' : 'bg-brand-500'} shadow-sm`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark-light.png" alt="Umrah Connect" className="w-6 h-6 object-contain" />
      </div>
      <div className="leading-none">
        <p className={`font-heading font-bold text-[15px] ${light ? 'text-white' : 'text-brand-600'}`}>Umrah Connect</p>
        <p className={`text-[9px] tracking-[0.2em] mt-1 ${light ? 'text-gold-400' : 'text-gold-500'}`}>CONNECTED JOURNEYS</p>
      </div>
    </Link>
  );
}

const SOLUTIONS = [
  { label: 'Travelers / Pilgrims', href: '/solutions#travelers', Icon: UserRound },
  { label: 'Operators / Agencies', href: '/solutions#operators', Icon: Building2 },
  { label: 'Hotels / Accommodation', href: '/solutions#hotels', Icon: Hotel },
  { label: 'Transport / Logistics', href: '/solutions#transport', Icon: Bus },
  { label: 'Visa Services', href: '/solutions#visa', Icon: FileCheck2 },
  { label: 'Finance / Payments', href: '/solutions#finance', Icon: Wallet },
  { label: 'Super Admin / Governance', href: '/solutions#admin', Icon: Shield },
];

const RESOURCES = [
  { label: 'Blogs', href: '/resources#blogs', Icon: BookOpen },
  { label: 'Guides', href: '/resources#guides', Icon: Map },
  { label: 'Help Center', href: '/help', Icon: LifeBuoy },
  { label: 'API Docs', href: '/api-docs', Icon: Code2 },
];

function Dropdown({ label, items }: { label: string; items: typeof SOLUTIONS }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="flex items-center gap-1 hover:text-brand-600 transition-colors">
        {label} <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-full pt-3 w-64 z-40">
          <div className="bg-white rounded-2xl border border-sandstone/70 shadow-xl shadow-brand-900/10 p-2">
            {items.map(({ label, href, Icon }) => (
              <Link key={label} href={href} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-ivory transition-colors">
                <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-brand-600" />
                </div>
                <span className="text-[13px] font-medium text-gray-700">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 bg-ivory/85 backdrop-blur-md border-b border-sandstone/60">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-[68px] flex items-center justify-between">
        <Brandmark />
        <nav className="hidden lg:flex items-center gap-8 text-[13px] font-medium text-gray-600">
          <Dropdown label="Solutions" items={SOLUTIONS} />
          <Link href="/marketplace-preview" className="hover:text-brand-600 transition-colors">Marketplace</Link>
          <Dropdown label="Resources" items={RESOURCES} />
          <Link href="/pricing" className="hover:text-brand-600 transition-colors">Pricing</Link>
          <Link href="/about" className="hover:text-brand-600 transition-colors">About Us</Link>
        </nav>
        <div className="flex items-center gap-2.5">
          <Link href="/login" className="hidden sm:inline-flex items-center px-4 py-2 text-[13px] font-semibold text-gray-700 hover:text-brand-600 rounded-xl border border-sandstone transition-colors">
            Log in
          </Link>
          <Link href="/signup" className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-sm transition-colors">
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

// FIX-08: real social handles go here when available (set href to the URL).
// null href renders an intentionally-disabled placeholder — never a dead link.
const SOCIALS: { Icon: any; label: string; href: string | null }[] = [
  { Icon: Linkedin, label: 'LinkedIn', href: null },
  { Icon: Youtube, label: 'YouTube', href: null },
  { Icon: Twitter, label: 'X (Twitter)', href: null },
  { Icon: Instagram, label: 'Instagram', href: null },
  { Icon: Facebook, label: 'Facebook', href: null },
];

const FOOTER_COLS = [
  { h: 'Platform', items: [['Solutions', '/solutions'], ['How It Works', '/workflow'], ['Security', '/security'], ['Integrations', '/integrations']] },
  { h: 'Marketplace', items: [['Hotels', '/marketplace-preview?category=hotels'], ['Transport', '/marketplace-preview?category=transport'], ['Visa Services', '/marketplace-preview?category=visa'], ['Packages', '/marketplace-preview?category=packages']] },
  { h: 'Resources', items: [['Blogs', '/resources#blogs'], ['Guides', '/resources#guides'], ['Help Center', '/help'], ['API Docs', '/api-docs']] },
  { h: 'Company', items: [['About Us', '/about'], ['Careers', '/careers'], ['Partners', '/partners'], ['Contact Us', '/contact']] },
];

export function PublicFooter() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const subscribe = async () => {
    if (!email) return;
    try {
      const { apiClient } = await import('@/lib/api');
      await apiClient.post('/inquiries', { type: 'NEWSLETTER', email, metadata: { source: 'footer' } });
      setDone(true); setEmail('');
    } catch { /* keep silent on the public footer */ setDone(true); }
  };
  return (
    <footer className="bg-brand-700 text-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14">
        <div className="grid lg:grid-cols-6 gap-10">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <Mail className="h-5 w-5 text-gold-400" />
              <div>
                <p className="font-semibold text-sm">Stay updated with Umrah Connect</p>
                <p className="text-[12px] text-white/60">Get the latest updates, offers and insights.</p>
              </div>
            </div>
            {done ? (
              <p className="text-[13px] text-gold-300 font-medium">Thank you — you&apos;re subscribed.</p>
            ) : (
              <div className="flex gap-2 max-w-sm">
                <input
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && subscribe()}
                  placeholder="Enter your email" type="email"
                  className="flex-1 bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/40 outline-none focus:border-gold-400"
                />
                <button onClick={subscribe} className="bg-gold-500 hover:bg-gold-600 text-brand-900 font-semibold text-sm px-5 rounded-xl transition-colors">Subscribe</button>
              </div>
            )}
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.h}>
              <p className="font-heading font-bold text-sm mb-3">{col.h}</p>
              <ul className="space-y-2">
                {col.items.map(([label, href]) => (
                  <li key={label}><Link href={href} className="text-[13px] text-white/65 hover:text-gold-300 transition-colors">{label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <span className="text-[12px] text-white/55">© 2026 Umrah Connect. All rights reserved.</span>
            <Link href="/privacy" className="text-[12px] text-white/55 hover:text-white">Privacy Policy</Link>
            <Link href="/terms" className="text-[12px] text-white/55 hover:text-white">Terms of Service</Link>
          </div>
          <div className="flex items-center gap-3">
            <Brandmark light />
            {/* FIX-08: social profiles not live yet — rendered as intentionally
                disabled placeholders (no dead href="#"). Swap `href` in SOCIALS
                for the real handles when available. */}
            <div className="flex items-center gap-2.5 ml-3">
              {SOCIALS.map(({ Icon, label, href }) => (
                href ? (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
                    className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                    <Icon className="h-3.5 w-3.5 text-white/80" />
                  </a>
                ) : (
                  <span key={label} aria-disabled="true" title={`${label} — coming soon`}
                    className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center cursor-default">
                    <Icon className="h-3.5 w-3.5 text-white/30" />
                  </span>
                )
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Shared public-page primitives (approved design system) ───────────────────
export function PublicHero({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <section className="max-w-7xl mx-auto px-6 lg:px-8 pt-16 pb-10 text-center">
      <span className="inline-flex items-center gap-2 text-[10.5px] font-bold tracking-[0.14em] text-brand-700 bg-brand-50 px-3.5 py-1.5 rounded-full border border-brand-200">
        {eyebrow}
      </span>
      <h1 className="mt-6 font-heading text-4xl lg:text-[52px] font-extrabold leading-[1.06] tracking-tight text-brand-600 max-w-3xl mx-auto">
        {title}
      </h1>
      {subtitle && <p className="mt-5 text-[17px] text-gray-600 leading-relaxed max-w-2xl mx-auto">{subtitle}</p>}
    </section>
  );
}

export function CTASection({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <section className="max-w-5xl mx-auto px-6 lg:px-8 py-16 text-center">
      <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-3xl p-12 text-white">
        <h2 className="font-heading text-3xl font-extrabold">{title ?? 'Ready to begin your connected journey?'}</h2>
        <p className="mt-3 text-white/75 max-w-xl mx-auto">{subtitle ?? 'Join operators, hotels, transport, visa agencies, finance teams and travelers already on Umrah Connect.'}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-brand-900 px-6 py-3.5 rounded-xl font-semibold text-sm transition-colors">
            Get Started <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/login" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3.5 rounded-xl font-semibold text-sm border border-white/20 transition-colors">
            Log in
          </Link>
        </div>
      </div>
    </section>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ivory text-gray-900 flex flex-col">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
