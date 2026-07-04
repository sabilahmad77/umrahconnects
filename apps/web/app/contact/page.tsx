import { Mail, MessageSquare, Building2, LifeBuoy } from 'lucide-react';
import { PublicShell, PublicHero } from '@/components/public/public-chrome';
import { InquiryForm } from '@/components/public/inquiry-form';

export const metadata = { title: 'Contact Us — Umrah Connect' };

const VARIANTS: Record<string, { eyebrow: string; title: string; subtitle: string; type: 'CONTACT' | 'DEMO' | 'SUPPORT'; Icon: any }> = {
  demo: { eyebrow: 'REQUEST A DEMO', title: 'See Umrah Connect in action.', subtitle: 'Tell us about your operation and we’ll set up a personalized walkthrough of the platform.', type: 'DEMO', Icon: Building2 },
  sales: { eyebrow: 'TALK TO SALES', title: 'Let’s find the right plan for you.', subtitle: 'Share a few details and our team will help you get set up with the right plan and onboarding.', type: 'CONTACT', Icon: MessageSquare },
  support: { eyebrow: 'CONTACT SUPPORT', title: 'We’re here to help.', subtitle: 'Describe what you need help with and our support team will get back to you.', type: 'SUPPORT', Icon: LifeBuoy },
  default: { eyebrow: 'CONTACT US', title: 'Get in touch.', subtitle: 'Questions, feedback or partnership ideas — send us a message and we’ll respond as soon as we can.', type: 'CONTACT', Icon: Mail },
};

export default function ContactPage({ searchParams }: { searchParams: { type?: string } }) {
  const key = (searchParams?.type ?? 'default').toLowerCase();
  const v = VARIANTS[key] ?? VARIANTS.default;
  return (
    <PublicShell>
      <PublicHero eyebrow={v.eyebrow} title={v.title} subtitle={v.subtitle} />
      <section className="max-w-2xl mx-auto px-6 lg:px-8 pb-16">
        <InquiryForm
          type={v.type}
          fields={['name', 'email', 'phone', 'company', 'subject', 'message']}
          cta={v.type === 'DEMO' ? 'Request demo' : v.type === 'SUPPORT' ? 'Submit support request' : 'Send message'}
          metadata={{ source: key }}
        />
        <div className="mt-6 flex items-center justify-center gap-2 text-[13px] text-gray-400">
          <Mail className="h-4 w-4" /> Prefer email? Reach us at <span className="text-brand-600 font-medium">hello@umrahconnect.app</span>
        </div>
      </section>
    </PublicShell>
  );
}
