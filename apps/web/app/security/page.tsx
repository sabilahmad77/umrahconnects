import { ShieldCheck, Lock, KeyRound, ScrollText, Users, Database } from 'lucide-react';
import { PublicShell, PublicHero, CTASection } from '@/components/public/public-chrome';

export const metadata = { title: 'Security — Umrah Connect' };

const ITEMS = [
  { Icon: Lock, t: 'Account authentication', d: 'JWT-based sessions with short-lived access tokens and rotating refresh tokens. Passwords are hashed with bcrypt.' },
  { Icon: Users, t: 'Role-based access control', d: 'Account roles and endpoint permissions determine supported actions. Workspace context is visible in the application.' },
  { Icon: Database, t: 'Tenant workspaces', d: 'Workspaces organize tenant records separately. Access is controlled by the platform and account permissions.' },
  { Icon: ScrollText, t: 'Audit logging', d: 'Governance screens provide recorded activity with actor, action and timestamp where supported.' },
  { Icon: KeyRound, t: 'KYC verification', d: 'Governance includes a provider KYC review workflow. Review the specific provider and service information before booking.' },
  { Icon: ShieldCheck, t: 'Application controls', d: 'Hardened HTTP headers, input validation and upload controls form part of the platform implementation.' },
];

export default function SecurityPage() {
  return (
    <PublicShell>
      <PublicHero eyebrow="SECURITY & TRUST" title="Built for trust and protection." subtitle="Umrah Connect handles pilgrim data, payments and operator records — security and compliance are foundational, not afterthoughts." />
      <section className="max-w-6xl mx-auto px-6 lg:px-8 pb-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ITEMS.map(({ Icon, t, d }) => (
            <div key={t} className="bg-white rounded-2xl border border-sandstone/60 p-6">
              <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center mb-3"><Icon className="h-5 w-5 text-brand-600" /></div>
              <p className="font-heading font-bold text-gray-900">{t}</p>
              <p className="text-[13px] text-gray-600 mt-1.5 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>
      <CTASection title="Questions about security or compliance?" subtitle="Our team is happy to walk through how Umrah Connect protects your data." />
    </PublicShell>
  );
}
