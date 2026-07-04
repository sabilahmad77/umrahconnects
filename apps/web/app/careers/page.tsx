import { Sparkles, Heart, Rocket, Globe2 } from 'lucide-react';
import { PublicShell, PublicHero } from '@/components/public/public-chrome';
import { InquiryForm } from '@/components/public/inquiry-form';

export const metadata = { title: 'Careers — Umrah Connect' };

const PERKS = [
  { Icon: Heart, t: 'Meaningful mission', d: 'Build technology that serves millions of pilgrims and the people who care for them.' },
  { Icon: Rocket, t: 'Early-stage impact', d: 'Shape a category-defining platform from the ground up.' },
  { Icon: Globe2, t: 'Connected, remote-friendly', d: 'Work with a distributed team across the Umrah ecosystem.' },
];

export default function CareersPage() {
  return (
    <PublicShell>
      <PublicHero eyebrow="CAREERS" title="Help build the future of Umrah travel." subtitle="We're a small, focused team building the connected operating system for Umrah. We're not actively hiring for specific roles right now — but we always want to hear from exceptional people." />
      <section className="max-w-6xl mx-auto px-6 lg:px-8 pb-12">
        <div className="grid sm:grid-cols-3 gap-4">
          {PERKS.map(({ Icon, t, d }) => (
            <div key={t} className="bg-white rounded-2xl border border-sandstone/60 p-6">
              <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center mb-3"><Icon className="h-5 w-5 text-brand-600" /></div>
              <p className="font-heading font-bold text-gray-900">{t}</p>
              <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="max-w-2xl mx-auto px-6 lg:px-8 pb-16">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-gold-700 bg-gold-50 px-3 py-1.5 rounded-full">
            <Sparkles className="h-3.5 w-3.5" /> Open application
          </div>
          <h2 className="font-heading font-bold text-2xl text-gray-900 mt-3">Register your interest</h2>
          <p className="text-[14px] text-gray-500 mt-2">Tell us about yourself and how you&apos;d like to contribute. We&apos;ll reach out when a matching opportunity opens.</p>
        </div>
        <InquiryForm
          type="CAREERS"
          fields={['name', 'email', 'subject', 'message']}
          cta="Submit application"
          metadata={{ source: 'careers' }}
          successText="Thank you for your interest in Umrah Connect. We've saved your details and will be in touch when a matching role opens."
        />
      </section>
    </PublicShell>
  );
}
