import { PublicShell } from '@/components/public/public-chrome';

export const metadata = { title: 'Terms of Service — Umrah Connect' };

const SECTIONS = [
  { h: '1. Acceptance of terms', b: 'By accessing or using Umrah Connect, you agree to these Terms of Service. If you are using the platform on behalf of an organization, you agree on its behalf.' },
  { h: '2. The platform', b: 'Umrah Connect is a connected operating system for Umrah travel — a marketplace, CRM, booking engine, social hub and finance platform serving travelers, operators, hotels, transport companies, visa agencies and finance teams.' },
  { h: '3. Accounts & roles', b: 'You are responsible for the accuracy of your account information and for safeguarding your credentials. Access is role-based and scoped to your tenant. Providers must complete KYC verification before transacting.' },
  { h: '4. Bookings & providers', b: 'Bookings are agreements between travelers and the relevant providers. Umrah Connect facilitates discovery, coordination, payment and record-keeping, but providers are responsible for delivering their services.' },
  { h: '5. Payments', b: 'Payments, invoices and refunds are processed and recorded on the platform in SAR. You agree to pay applicable amounts for services you book or provide.' },
  { h: '6. Acceptable use', b: 'You agree not to misuse the platform, post unlawful or harmful content, attempt to access data outside your role, or disrupt the service. We may suspend accounts that violate these terms.' },
  { h: '7. Content & community', b: 'Content you post to the Social Hub must respect community standards. You retain ownership of your content and grant us a license to display it on the platform.' },
  { h: '8. Limitation of liability', b: 'The platform is provided on an "as is" basis. To the extent permitted by law, Umrah Connect is not liable for indirect or consequential damages arising from your use of the service.' },
  { h: '9. Changes', b: 'We may update these terms from time to time. Continued use of the platform after changes constitutes acceptance of the updated terms.' },
  { h: '10. Contact', b: 'Questions about these terms can be sent through the Contact page.' },
];

export default function TermsPage() {
  return (
    <PublicShell>
      <section className="max-w-3xl mx-auto px-6 lg:px-8 pt-16 pb-16">
        <p className="text-[11px] font-bold tracking-[0.14em] text-gold-600">LEGAL</p>
        <h1 className="font-heading text-4xl font-extrabold text-brand-600 mt-2">Terms of Service</h1>
        <p className="text-[13px] text-gray-500 mt-2">Last updated: June 2026</p>
        <div className="mt-8 space-y-6">
          {SECTIONS.map((s) => (
            <div key={s.h}>
              <h2 className="font-heading font-bold text-lg text-gray-900">{s.h}</h2>
              <p className="text-[14.5px] text-gray-600 mt-2 leading-relaxed">{s.b}</p>
            </div>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
