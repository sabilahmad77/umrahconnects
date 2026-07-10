import { PublicShell } from '@/components/public/public-chrome';

export const metadata = { title: 'Privacy Policy — Umrah Connect' };

const SECTIONS = [
  { h: '1. Information we collect', b: 'We collect information you provide when you create an account, complete bookings, submit website forms, or contact us — such as your name, email, phone number, organization and travel details. For providers, we also collect business and KYC verification information.' },
  { h: '2. How we use your information', b: 'We use your information to operate the platform: to process bookings and payments, coordinate between travelers and providers, verify provider identity, send notifications, provide support, and improve our services. Operator and pilgrim data is scoped to its tenant.' },
  { h: '3. Data sharing', b: 'We share booking and coordination data only with the providers and operators directly involved in your journey. We do not sell your personal information. Service providers who help us run the platform are bound by confidentiality obligations.' },
  { h: '4. Data security', b: 'We protect your data with encrypted authentication, role-based access control, multi-tenant isolation and audit logging. Access to your data is restricted to your role and tenant.' },
  { h: '5. Data retention', b: 'We retain your information for as long as your account is active or as needed to provide services, comply with legal obligations, resolve disputes and enforce agreements.' },
  { h: '6. Your rights', b: 'You may request access to, correction of, or deletion of your personal information, subject to legal and operational requirements. Contact us to exercise these rights.' },
  { h: '7. Contact', b: 'For privacy questions or requests, contact us through the Contact page. We will respond as promptly as we can.' },
];

export default function PrivacyPage() {
  return (
    <PublicShell>
      <section className="max-w-3xl mx-auto px-6 lg:px-8 pt-16 pb-16">
        <p className="text-[11px] font-bold tracking-[0.14em] text-gold-600">LEGAL</p>
        <h1 className="font-heading text-4xl font-extrabold text-brand-600 mt-2">Privacy Policy</h1>
        <p className="text-[13px] text-gray-500 mt-2">Last updated: June 2026</p>
        <p className="text-[15px] text-gray-600 mt-6 leading-relaxed">
          This Privacy Policy explains how Umrah Connect collects, uses and protects information across our platform —
          for travelers, operators, hotels, transport companies, visa agencies and finance teams.
        </p>
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
