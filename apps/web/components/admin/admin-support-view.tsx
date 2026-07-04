'use client';

import Link from 'next/link';
import { LifeBuoy, MessageSquare, AlertTriangle, Inbox, ArrowRight } from 'lucide-react';

/**
 * Support / issues — entry surface that aggregates the existing inbound
 * channels (post reports, marketplace inquiries, marketplace requests).
 * Future iteration: a dedicated SupportTicket model.
 */
export function AdminSupportView() {
  return (
    <div className="space-y-5 pb-10 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support &amp; issues</h1>
        <p className="text-sm text-gray-500 mt-0.5">Inbound channels where users report problems or request help</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SupportTile
          href="/marketplace"
          icon={MessageSquare}
          title="Marketplace inquiries"
          subtitle="Customer questions about listings"
          color="bg-blue-50 text-blue-700"
        />
        <SupportTile
          href="/requests"
          icon={Inbox}
          title="Marketplace requests"
          subtitle="Open service requests from travelers"
          color="bg-purple-50 text-purple-700"
        />
        <SupportTile
          href="/admin-kyc"
          icon={AlertTriangle}
          title="KYC review"
          subtitle="Pending tenant verifications"
          color="bg-yellow-50 text-yellow-700"
        />
        <SupportTile
          href="/admin-logs"
          icon={LifeBuoy}
          title="System logs"
          subtitle="Audit trail of platform events"
          color="bg-green-50 text-green-700"
        />
      </div>

      <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4">
        <p className="text-sm font-semibold text-yellow-800 mb-1">Dedicated support tickets — coming soon</p>
        <p className="text-xs text-yellow-700">
          A first-class <code>SupportTicket</code> model with status workflow, SLA tracking and assignment will be added here.
          For now the four surfaces above are the working inbound channels.
        </p>
      </div>
    </div>
  );
}

function SupportTile({ href, icon: Icon, title, subtitle, color }: { href: string; icon: any; title: string; subtitle: string; color: string }) {
  return (
    <Link href={href} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md hover:border-brand-200 transition-all flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
        <p className="text-xs text-brand-500 inline-flex items-center gap-1 mt-2">Open <ArrowRight className="h-3 w-3" /></p>
      </div>
    </Link>
  );
}
