import Link from 'next/link';
import { BookOpen, Map, LifeBuoy, Code2, ArrowRight } from 'lucide-react';
import { PublicShell, PublicHero, CTASection } from '@/components/public/public-chrome';

export const metadata = { title: 'Resources — Umrah Connect' };

// Each card links to a real, fully-written article (lib/articles.ts) — no dead ends.
const BLOGS = [
  { t: 'Best times to visit the Rawdah in Madinah', c: 'Travel guidance', slug: 'best-times-to-visit-rawdah' },
  { t: 'A complete packing checklist for Umrah', c: 'Pilgrim tips', slug: 'umrah-packing-checklist' },
  { t: 'How operators cut booking errors with one connected CRM', c: 'For operators', slug: 'operators-reduce-booking-errors' },
  { t: 'Understanding Nusuk & Masar visa requirements', c: 'Visa & compliance', slug: 'nusuk-masar-visa-requirements' },
];

const GUIDES = [
  { t: 'Getting started as an operator on Umrah Connect', c: 'Onboarding', slug: 'operator-onboarding-guide' },
  { t: 'Listing your hotel on the marketplace', c: 'Hotels', slug: 'hotel-listing-guide' },
  { t: 'Managing fleet, drivers and routes', c: 'Transport', slug: 'fleet-management-guide' },
  { t: 'Invoices, payments and reconciliation', c: 'Finance', slug: 'invoices-payments-reconciliation' },
];

function Cards({ id, title, Icon, items }: { id: string; title: string; Icon: any; items: { t: string; c: string; slug: string }[] }) {
  return (
    <section id={id} className="scroll-mt-24 max-w-6xl mx-auto px-6 lg:px-8 pb-12">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center"><Icon className="h-4 w-4 text-brand-600" /></div>
        <h2 className="font-heading font-bold text-xl text-gray-900">{title}</h2>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {items.map((it) => (
          <Link key={it.slug} href={`/resources/${it.slug}`} className="bg-white rounded-2xl border border-sandstone/60 p-5 hover:shadow-lg hover:shadow-brand-900/5 transition-all group">
            <span className="text-[10.5px] font-bold tracking-wider text-gold-600 bg-gold-50 px-2 py-1 rounded-md">{it.c.toUpperCase()}</span>
            <p className="font-heading font-bold text-gray-900 mt-3 group-hover:text-brand-600 transition-colors">{it.t}</p>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-600 mt-3">Read more <ArrowRight className="h-3.5 w-3.5" /></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function ResourcesPage() {
  return (
    <PublicShell>
      <PublicHero eyebrow="RESOURCES" title="Guides, insights and help for your journey." subtitle="Everything you need to get the most out of Umrah Connect — for travelers and providers alike." />
      <Cards id="blogs" title="Blog & insights" Icon={BookOpen} items={BLOGS} />
      <Cards id="guides" title="Guides & how-tos" Icon={Map} items={GUIDES} />
      <section className="max-w-6xl mx-auto px-6 lg:px-8 pb-16 grid sm:grid-cols-2 gap-4">
        <Link href="/help" className="bg-white rounded-2xl border border-sandstone/60 p-6 flex items-center gap-4 hover:shadow-lg hover:shadow-brand-900/5 transition-all">
          <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center"><LifeBuoy className="h-6 w-6 text-brand-600" /></div>
          <div><p className="font-heading font-bold text-gray-900">Help Center</p><p className="text-[13px] text-gray-500 mt-0.5">Browse FAQs and get support.</p></div>
        </Link>
        <Link href="/api-docs" className="bg-white rounded-2xl border border-sandstone/60 p-6 flex items-center gap-4 hover:shadow-lg hover:shadow-brand-900/5 transition-all">
          <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center"><Code2 className="h-6 w-6 text-brand-600" /></div>
          <div><p className="font-heading font-bold text-gray-900">API Docs</p><p className="text-[13px] text-gray-500 mt-0.5">Partner & integration docs (coming soon).</p></div>
        </Link>
      </section>
      <CTASection />
    </PublicShell>
  );
}
