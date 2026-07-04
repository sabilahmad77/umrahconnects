import Link from 'next/link';
import { ArrowRight, Building2, Hotel, Bus, FileCheck2, Wallet, UserRound, Shield, CheckCircle2 } from 'lucide-react';
import { PublicShell, PublicHero, CTASection } from '@/components/public/public-chrome';

export const metadata = { title: 'Solutions — Umrah Connect' };

const SOLUTIONS = [
  {
    id: 'travelers', Icon: UserRound, role: 'Travelers / Pilgrims',
    headline: 'Plan, book and manage your sacred journey with confidence.',
    points: ['Browse and compare verified hotels, transport, visa and full packages', 'Track bookings, itinerary, departures and visa status in one place', 'Join the Social Hub community, groups and trusted provider updates', 'Receive real-time notifications for confirmations, payments and travel updates'],
  },
  {
    id: 'operators', Icon: Building2, role: 'Operators / Agencies',
    headline: 'Run your entire Umrah operation from one connected workspace.',
    points: ['Pilgrim CRM with profiles, passports, group assignments and audit trail', 'Bookings pipeline from inquiry to quotation to confirmation', 'Hotel allotments, transport assignments and visa compliance in one view', 'Finance snapshot: revenue, receipts, payables and reconciliation'],
  },
  {
    id: 'hotels', Icon: Hotel, role: 'Hotels / Accommodation',
    headline: 'Optimize occupancy, pricing and the guest experience.',
    points: ['Room inventory, allotments and live availability by room type', 'Occupancy, RevPAR and average daily rate analytics', 'Booking status tracking and guest experience feedback', 'List your property on the Umrah Connect marketplace'],
  },
  {
    id: 'transport', Icon: Bus, role: 'Transport / Logistics',
    headline: 'Smart routing, fleet management and real-time coordination.',
    points: ['Manage vehicles, drivers and routes per group and departure', 'Assign transport to bookings and track on-time performance', 'Coordinate airport, Makkah and Madinah transfers', 'Fleet utilization and trip analytics'],
  },
  {
    id: 'visa', Icon: FileCheck2, role: 'Visa Services',
    headline: 'Faster visa processing with higher approval rates.',
    points: ['Nusuk & Masar-ready application pipeline and document checklist', 'Track submission, review, approval and rejection statuses', 'Manage applicant documents and service requests', 'Compliance reporting and approval-rate analytics'],
  },
  {
    id: 'finance', Icon: Wallet, role: 'Finance / Payments',
    headline: 'Reconciliation, settlements and financial insight, SAR-native.',
    points: ['Quotes → invoices → payments → reconciliation in one ledger', 'Record payments, partial payments and refunds with full history', 'Budget plans and outstanding-balance tracking', 'Financial reports and exportable analytics'],
  },
  {
    id: 'admin', Icon: Shield, role: 'Super Admin / Governance',
    headline: 'Platform-wide control, moderation and governance.',
    points: ['Manage all tenants, users, pilgrims, bookings and groups', 'KYC verification: review, approve and reject submissions', 'Marketplace moderation and listing approvals', 'Roles, permissions, audit logs and platform settings'],
  },
];

export default function SolutionsPage() {
  return (
    <PublicShell>
      <PublicHero
        eyebrow="SOLUTIONS FOR EVERY ROLE"
        title="One platform, seven dedicated solutions."
        subtitle="Umrah Connect gives every part of the Umrah ecosystem its own purpose-built workspace — connected to the same trusted data."
      />
      <section className="max-w-7xl mx-auto px-6 lg:px-8 pb-16 space-y-5">
        {SOLUTIONS.map(({ id, Icon, role, headline, points }) => (
          <div key={id} id={id} className="scroll-mt-24 bg-white rounded-2xl border border-sandstone/60 p-6 sm:p-8 grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
                <Icon className="h-6 w-6 text-brand-600" />
              </div>
              <p className="text-[11px] font-bold tracking-[0.14em] text-gold-600">{role.toUpperCase()}</p>
              <p className="font-heading font-bold text-xl text-gray-900 mt-2 leading-snug">{headline}</p>
            </div>
            <div className="lg:col-span-2 grid sm:grid-cols-2 gap-3 content-center">
              {points.map((p) => (
                <div key={p} className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />
                  <span className="text-[13.5px] text-gray-600 leading-snug">{p}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
      <CTASection />
    </PublicShell>
  );
}
