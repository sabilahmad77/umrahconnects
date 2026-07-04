import { Plug, FileCheck2, CreditCard, MessageSquare, Plane, Database, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { PublicShell, PublicHero, CTASection } from '@/components/public/public-chrome';

export const metadata = { title: 'Integrations — Umrah Connect' };

const INTEGRATIONS = [
  { Icon: FileCheck2, t: 'Visa systems', d: 'Nusuk & Masar-ready visa pipeline and document workflows.', status: 'Available' },
  { Icon: CreditCard, t: 'Payments & invoicing', d: 'SAR-native invoicing, payment recording and reconciliation. Live gateway connectors on the roadmap.', status: 'Available' },
  { Icon: MessageSquare, t: 'Messaging & notifications', d: 'In-platform messaging and a real-time notification engine across bookings, finance and social events.', status: 'Available' },
  { Icon: Plane, t: 'Flights & travel data', d: 'Itinerary and travel updates surfaced to pilgrims and operators.', status: 'Roadmap' },
  { Icon: Database, t: 'Partner API', d: 'A public partner API for deeper integration with your own systems.', status: 'Coming soon' },
  { Icon: Plug, t: 'Custom connectors', d: 'Bespoke integrations for enterprise operators and platform partners.', status: 'On request' },
];

export default function IntegrationsPage() {
  return (
    <PublicShell>
      <PublicHero eyebrow="INTEGRATIONS" title="Connect Umrah Connect to the tools you rely on." subtitle="From visa systems and payments to messaging and a partner API, Umrah Connect is built to plug into the wider Umrah supply chain." />
      <section className="max-w-6xl mx-auto px-6 lg:px-8 pb-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {INTEGRATIONS.map(({ Icon, t, d, status }) => (
            <div key={t} className="bg-white rounded-2xl border border-sandstone/60 p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center"><Icon className="h-5 w-5 text-brand-600" /></div>
                <span className={`text-[10.5px] font-bold px-2 py-1 rounded-full ${status === 'Available' ? 'bg-brand-50 text-brand-700' : 'bg-gold-50 text-gold-700'}`}>{status}</span>
              </div>
              <p className="font-heading font-bold text-gray-900">{t}</p>
              <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/partners" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:gap-2.5 transition-all">
            Become an integration partner <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <CTASection />
    </PublicShell>
  );
}
