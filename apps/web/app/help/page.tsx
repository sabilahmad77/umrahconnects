import Link from 'next/link';
import { UserRound, Building2, CreditCard, FileCheck2, ShoppingBag, MessagesSquare, ArrowRight } from 'lucide-react';
import { PublicShell, PublicHero, CTASection } from '@/components/public/public-chrome';

export const metadata = { title: 'Help Center — Umrah Connect' };

const CATEGORIES = [
  { Icon: UserRound, t: 'Getting started', d: 'Create an account, pick your role and set up your workspace.' },
  { Icon: ShoppingBag, t: 'Marketplace & booking', d: 'Browsing listings, sending requests and confirming bookings.' },
  { Icon: CreditCard, t: 'Payments & invoices', d: 'Paying, invoices, refunds and reconciliation.' },
  { Icon: FileCheck2, t: 'Visa & compliance', d: 'Visa applications, documents and approval statuses.' },
  { Icon: Building2, t: 'For providers', d: 'Listings, CRM, inventory, fleet and finance.' },
  { Icon: MessagesSquare, t: 'Social Hub & community', d: 'Posts, groups, connections and messaging.' },
];

const FAQS = [
  { q: 'Is Umrah Connect free for travelers?', a: 'Yes. Travelers can browse the marketplace, manage bookings and join the community for free. Providers use tailored plans.' },
  { q: 'Do I need an account to browse the marketplace?', a: 'No. You can browse hotels, transport, visa services and packages as a guest. You only need to sign in to book, contact a provider or perform protected actions.' },
  { q: 'How do providers get verified?', a: 'Providers complete a KYC verification reviewed by platform governance before they can transact on the marketplace.' },
  { q: 'Which roles does the platform support?', a: 'Travelers, Operators/Agencies, Hotels, Transport, Visa Agencies, Finance Managers and Super Admin governance.' },
  { q: 'How do I contact support?', a: 'Use the Contact page to reach our team — submissions go straight to our support inbox.' },
];

export default function HelpPage() {
  return (
    <PublicShell>
      <PublicHero eyebrow="HELP CENTER" title="How can we help?" subtitle="Browse help categories and frequently asked questions, or reach our support team directly." />
      <section className="max-w-6xl mx-auto px-6 lg:px-8 pb-12">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CATEGORIES.map(({ Icon, t, d }) => (
            <div key={t} className="bg-white rounded-2xl border border-sandstone/60 p-5">
              <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center mb-3"><Icon className="h-5 w-5 text-brand-600" /></div>
              <p className="font-heading font-bold text-gray-900">{t}</p>
              <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="max-w-4xl mx-auto px-6 lg:px-8 pb-12">
        <h2 className="font-heading font-bold text-2xl text-gray-900 mb-5">Frequently asked questions</h2>
        <div className="space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="group bg-white rounded-2xl border border-sandstone/60 p-5">
              <summary className="font-semibold text-gray-900 cursor-pointer list-none flex items-center justify-between">
                {f.q} <span className="text-brand-500 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
              </summary>
              <p className="text-[14px] text-gray-600 mt-3 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link href="/contact?type=support" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:gap-2.5 transition-all">
            Still need help? Contact support <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <CTASection />
    </PublicShell>
  );
}
