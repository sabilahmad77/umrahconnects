import { Handshake, Hotel, Bus, FileCheck2, Code2, Building2 } from 'lucide-react';
import { PublicShell, PublicHero } from '@/components/public/public-chrome';
import { InquiryForm } from '@/components/public/inquiry-form';

export const metadata = { title: 'Partners — Umrah Connect' };

const TYPES = [
  { Icon: Hotel, t: 'Hotels & accommodation', d: 'List rooms and reach operators and pilgrims directly.' },
  { Icon: Bus, t: 'Transport providers', d: 'Offer fleet and transfer services across the journey.' },
  { Icon: FileCheck2, t: 'Visa agencies', d: 'Provide visa processing and compliance services.' },
  { Icon: Building2, t: 'Operators & agencies', d: 'Bring your operation onto a connected platform.' },
  { Icon: Code2, t: 'Technology partners', d: 'Integrate with our API and build on Umrah Connect.' },
  { Icon: Handshake, t: 'Strategic partners', d: 'Explore distribution and ecosystem partnerships.' },
];

export default function PartnersPage() {
  return (
    <PublicShell>
      <PublicHero eyebrow="PARTNERS" title="Grow with Umrah Connect." subtitle="Join a connected ecosystem of hotels, transport, visa agencies, operators and technology partners serving Umrah travelers worldwide." />
      <section className="max-w-6xl mx-auto px-6 lg:px-8 pb-12">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TYPES.map(({ Icon, t, d }) => (
            <div key={t} className="bg-white rounded-2xl border border-sandstone/60 p-5">
              <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center mb-3"><Icon className="h-5 w-5 text-brand-600" /></div>
              <p className="font-heading font-bold text-gray-900">{t}</p>
              <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="max-w-2xl mx-auto px-6 lg:px-8 pb-16">
        <div className="text-center mb-6">
          <h2 className="font-heading font-bold text-2xl text-gray-900">Become a partner</h2>
          <p className="text-[14px] text-gray-500 mt-2">Tell us about your business and how you&apos;d like to partner. Our partnerships team will get back to you.</p>
        </div>
        <InquiryForm
          type="PARTNER"
          fields={['name', 'company', 'email', 'phone', 'message']}
          cta="Submit partner inquiry"
          metadata={{ source: 'partners' }}
          successText="Thank you — your partner inquiry has been received. Our partnerships team will reach out shortly."
        />
      </section>
    </PublicShell>
  );
}
