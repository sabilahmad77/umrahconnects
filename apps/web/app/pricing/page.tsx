import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { PublicShell, PublicHero, CTASection } from '@/components/public/public-chrome';

export const metadata = { title: 'Pricing — Umrah Connect' };

const PLANS = [
  {
    name: 'Traveler', price: 'Free', cadence: 'for pilgrims',
    desc: 'For individual travelers planning their Umrah journey.',
    features: ['Browse the full marketplace', 'Book hotels, transport & visa services', 'Social Hub community & groups', 'Itinerary & booking management', 'Real-time travel notifications'],
    cta: 'Get Started', href: '/signup', highlight: false,
  },
  {
    name: 'Operator / Provider', price: 'Contact Sales', cadence: 'tailored to your size',
    desc: 'For operators, hotels, transport and visa agencies running their business.',
    features: ['Everything in Traveler', 'Role-based operating dashboard', 'Pilgrim CRM & bookings pipeline', 'Inventory, fleet & visa management', 'Finance, invoices & reconciliation', 'Marketplace listings & lead generation'],
    cta: 'Contact Sales', href: '/contact?type=sales', highlight: true,
  },
  {
    name: 'Enterprise / Governance', price: 'Custom', cadence: 'for groups & platforms',
    desc: 'For large operators, multi-brand groups and platform governance.',
    features: ['Everything in Operator', 'Multi-tenant administration', 'KYC verification workflows', 'Advanced reporting & analytics', 'Roles, permissions & audit logs', 'Priority support & onboarding'],
    cta: 'Talk to us', href: '/contact?type=sales', highlight: false,
  },
];

export default function PricingPage() {
  return (
    <PublicShell>
      <PublicHero
        eyebrow="PRICING"
        title="Pricing that fits every role."
        subtitle="Travelers use Umrah Connect free. Providers and enterprises get tailored pricing based on team size and the services they run."
      />
      <section className="max-w-6xl mx-auto px-6 lg:px-8 pb-12">
        <div className="grid md:grid-cols-3 gap-5">
          {PLANS.map((p) => (
            <div key={p.name} className={`rounded-2xl border p-6 flex flex-col ${p.highlight ? 'border-brand-500 bg-white shadow-xl shadow-brand-900/10 ring-1 ring-brand-500' : 'border-sandstone/60 bg-white'}`}>
              {p.highlight && <span className="self-start text-[10px] font-bold tracking-wider text-brand-900 bg-gold-400 px-2.5 py-1 rounded-full mb-3">MOST POPULAR</span>}
              <p className="font-heading font-bold text-lg text-gray-900">{p.name}</p>
              <p className="text-[13px] text-gray-500 mt-1 leading-snug">{p.desc}</p>
              <div className="mt-4 mb-5">
                <span className="font-heading text-3xl font-extrabold text-brand-600">{p.price}</span>
                <span className="text-[12px] text-gray-400 ml-1.5">{p.cadence}</span>
              </div>
              <ul className="space-y-2.5 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px] text-gray-600">
                    <Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
              <Link href={p.href} className={`mt-6 inline-flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors ${p.highlight ? 'bg-brand-500 hover:bg-brand-600 text-white' : 'bg-ivory hover:bg-sandstone/40 text-brand-600 border border-sandstone'}`}>
                {p.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-[13px] text-gray-400 mt-8 max-w-2xl mx-auto">
          Final provider and enterprise pricing is confirmed with our team based on your services, volume and onboarding needs. No hidden fees — SAR-native billing.
        </p>
      </section>
      <CTASection title="Not sure which plan fits?" subtitle="Tell us about your operation and we'll recommend the right setup for your team." />
    </PublicShell>
  );
}
