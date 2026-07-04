import { Compass, HeartHandshake, ShieldCheck, Globe2 } from 'lucide-react';
import { PublicShell, PublicHero, CTASection } from '@/components/public/public-chrome';

export const metadata = { title: 'About Us — Umrah Connect' };

const VALUES = [
  { Icon: HeartHandshake, t: 'Service first', d: 'Every feature is built to make the pilgrim journey calmer and the operator’s work lighter.' },
  { Icon: ShieldCheck, t: 'Trust & compliance', d: 'Verified providers, KYC governance and audit-logged operations from the database up.' },
  { Icon: Globe2, t: 'One connected ecosystem', d: 'Travelers, operators, hotels, transport, visa and finance working on the same trusted data.' },
  { Icon: Compass, t: 'Purpose-built', d: 'Designed specifically for Umrah and Hajj — not a generic tool bent to fit.' },
];

const STATS = [
  ['7', 'Connected roles'],
  ['1', 'Unified platform'],
  ['100%', 'Audit-logged operations'],
  ['SAR', 'Native finance'],
];

export default function AboutPage() {
  return (
    <PublicShell>
      <PublicHero
        eyebrow="ABOUT UMRAH CONNECT"
        title="The connected operating system for Umrah."
        subtitle="We replace the spreadsheets, group chats, paper registers and disconnected tools the Umrah industry relies on today — with one calm, structured, connected platform."
      />
      <section className="max-w-5xl mx-auto px-6 lg:px-8 pb-12">
        <div className="bg-white rounded-2xl border border-sandstone/60 p-8">
          <p className="font-heading font-bold text-xl text-brand-600 mb-3">Our mission</p>
          <p className="text-[15px] text-gray-600 leading-relaxed">
            Millions of pilgrims travel for Umrah every year, served by thousands of operators, hotels, transport companies
            and visa agencies that still coordinate over spreadsheets and messaging apps. Umrah Connect brings them together
            into a single role-based operating system — a marketplace, CRM, booking engine, social hub and finance ledger
            that lets every stakeholder do their best work while giving pilgrims a clear, trusted journey.
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {STATS.map(([v, l]) => (
            <div key={l} className="bg-white rounded-2xl border border-sandstone/60 p-5 text-center">
              <p className="font-heading text-3xl font-extrabold text-brand-600">{v}</p>
              <p className="text-[12px] text-gray-500 mt-1">{l}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-6 lg:px-8 pb-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {VALUES.map(({ Icon, t, d }) => (
            <div key={t} className="bg-white rounded-2xl border border-sandstone/60 p-5">
              <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center mb-3">
                <Icon className="h-5 w-5 text-brand-600" />
              </div>
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
