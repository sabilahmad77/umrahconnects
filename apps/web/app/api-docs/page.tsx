import Link from 'next/link';
import { Code2, Webhook, KeyRound, BookOpen, ArrowRight } from 'lucide-react';
import { PublicShell, PublicHero, CTASection } from '@/components/public/public-chrome';

export const metadata = { title: 'API Docs — Umrah Connect' };

const PREVIEW = [
  { Icon: KeyRound, t: 'Authentication', d: 'OAuth-style API keys scoped per tenant and role.' },
  { Icon: Code2, t: 'REST endpoints', d: 'Bookings, listings, pilgrims, finance and visa resources.' },
  { Icon: Webhook, t: 'Webhooks', d: 'Real-time events for bookings, payments and status changes.' },
  { Icon: BookOpen, t: 'Guides & SDKs', d: 'Quick-start guides and client libraries for partners.' },
];

export default function ApiDocsPage() {
  return (
    <PublicShell>
      <PublicHero eyebrow="DEVELOPERS" title="Umrah Connect API — coming soon." subtitle="A public partner API and integration documentation are on the way, so you can connect Umrah Connect directly to your own systems." />
      <section className="max-w-4xl mx-auto px-6 lg:px-8 pb-10">
        <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-2xl p-8 text-center text-white">
          <span className="inline-block text-[11px] font-bold tracking-[0.16em] text-gold-300 bg-white/10 px-3 py-1.5 rounded-full">COMING SOON</span>
          <p className="font-heading text-2xl font-extrabold mt-4">Partner & integration API</p>
          <p className="text-white/75 mt-2 max-w-lg mx-auto text-[15px]">
            We&apos;re finalizing a secure, well-documented API for operators, platforms and technology partners.
            Want early access? Let us know and we&apos;ll keep you posted.
          </p>
          <Link href="/partners" className="inline-flex items-center gap-2 mt-6 bg-gold-500 hover:bg-gold-600 text-brand-900 px-6 py-3 rounded-xl font-semibold text-sm transition-colors">
            Request early access <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-6 lg:px-8 pb-16">
        <p className="text-center text-[13px] font-semibold tracking-wider text-gray-400 mb-5">WHAT TO EXPECT</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PREVIEW.map(({ Icon, t, d }) => (
            <div key={t} className="bg-white rounded-2xl border border-sandstone/60 p-5">
              <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center mb-3"><Icon className="h-5 w-5 text-brand-600" /></div>
              <p className="font-heading font-bold text-gray-900">{t}</p>
              <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>
      <CTASection />
    </PublicShell>
  );
}
