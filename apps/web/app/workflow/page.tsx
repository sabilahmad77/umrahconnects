import { Search, GitCompare, FileSignature, CheckCircle2, CreditCard, Bell, Map, Users2 } from 'lucide-react';
import { PublicShell, PublicHero, CTASection } from '@/components/public/public-chrome';

export const metadata = { title: 'How It Works — Umrah Connect' };

const STEPS = [
  { Icon: Search, t: 'Search', d: 'Browse verified hotels, transport, visa services and complete packages across the Umrah marketplace.' },
  { Icon: GitCompare, t: 'Compare', d: 'Compare providers by price, distance to Haram, ratings, availability and inclusions — side by side.' },
  { Icon: FileSignature, t: 'Request / Book', d: 'Send a request or book directly. Operators receive your enquiry and respond with quotations and offers.' },
  { Icon: CheckCircle2, t: 'Review Confirmation', d: 'Review your booking summary, group assignment and itinerary before confirming.' },
  { Icon: CreditCard, t: 'Payment / Invoice', d: 'Pay securely and receive a SAR-native invoice. Track partial payments and balances.' },
  { Icon: Bell, t: 'Notifications', d: 'Get real-time updates on confirmations, payments, visa status and travel changes.' },
  { Icon: Map, t: 'Travel Management', d: 'Manage your itinerary, departures, hotels and transport from one connected dashboard.' },
  { Icon: Users2, t: 'Provider Coordination', d: 'Operators, hotels, transport and visa agencies stay coordinated on the same shared record.' },
];

export default function WorkflowPage() {
  return (
    <PublicShell>
      <PublicHero
        eyebrow="HOW UMRAH CONNECT WORKS"
        title="Simple. Smart. Seamless."
        subtitle="From the first search to a fully managed journey — here is how every Umrah booking flows through the platform."
      />
      <section className="max-w-6xl mx-auto px-6 lg:px-8 pb-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(({ Icon, t, d }, i) => (
            <div key={t} className="bg-white rounded-2xl border border-sandstone/60 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-brand-600" />
                </div>
                <span className="text-[11px] font-bold text-gold-600">STEP {i + 1}</span>
              </div>
              <p className="font-heading font-bold text-gray-900">{t}</p>
              <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>
      <CTASection title="See the full workflow inside the platform" subtitle="Create an account to experience the complete search, booking, payment and travel-management journey." />
    </PublicShell>
  );
}
