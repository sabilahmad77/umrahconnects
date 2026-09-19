'use client';
import { LinkedStatBlock as KPI, CountTile as Tile } from '@/components/ui/system';
import { Button , QueryFailure } from '@/components/ui/system';

import Link from 'next/link';
import {
  FileCheck2, FilePlus2, Send, FileSearch, CheckCircle2, XCircle, Clock,
  Wallet, PauseCircle, RefreshCw, Plus, ArrowRight, Loader2, AlertCircle,
  Store, MessageSquare, Users, FolderOpen, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVisaDashboardStats } from '@/hooks/use-visa';
import { useCapabilities } from '@/hooks/use-capabilities';

export function VisaDashboard() {
  const { data: stats, isLoading, error, refetch } = useVisaDashboardStats();
  const { can } = useCapabilities();
  const canSubmit = can('visa:application:submit');
  const canFinance = can('finance:invoice:read');
  const canMarketplace = can('marketplace:listing:manage');

  if (error) return <QueryFailure error={error} onRetry={() => { refetch(); }} />;
  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visa agency operations</h1>
          <p className="text-sm text-gray-600 mt-0.5">Applications, documents, processing status and revenue</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" type="button" aria-label="Refresh dashboard" onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
          {canSubmit && (
            <Link href="/compliance" className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 shadow-sm">
              <Plus className="h-4 w-4" /> New application
            </Link>
          )}
        </div>
      </div>

      {isLoading || !stats ? (
        <div className="flex items-center justify-center py-12 text-gray-600 text-sm">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading dashboard…
        </div>
      ) : (
        <>
          <section className="border-l-4 border-brand-500 bg-white p-5"><h2 className="text-base font-semibold text-gray-900">Applications and document review</h2><p className="mt-2 text-sm text-gray-600">Review service requests and outstanding applicant documents before changing application status.</p><Link href="/visa-requests" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">Open work queue</Link></section>
          {/* Hero KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Total applications" value={stats.total} sub={`${stats.newRequests} new requests`} icon={FileCheck2} color="bg-brand-50 text-brand-700" href="/compliance" />
            <KPI label="Under review" value={stats.byStatus.UNDER_REVIEW + stats.byStatus.SUBMITTED} sub="submitted + review" icon={FileSearch} color="bg-blue-50 text-blue-700" href="/compliance" />
            <KPI label="Approved" value={stats.byStatus.APPROVED} sub={`${Math.round((stats.successRate ?? 0) * 100)}% of decided applications approved`} icon={CheckCircle2} color="bg-green-50 text-green-700" href="/compliance" />
            <KPI label="Open service tickets" value={stats.openTickets} sub={`${stats.documentsToReview} document(s) waiting for verification`} icon={Send} color="bg-saudi-50 text-saudi-700" href="/visa-requests" />
          </div>

          {/* Pipeline tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            <Tile label="New" value={stats.byStatus.NOT_STARTED} dot="bg-gray-400" />
            <Tile label="Collecting docs" value={stats.byStatus.DOCUMENTS_COLLECTING} dot="bg-yellow-500" />
            <Tile label="Submitted" value={stats.byStatus.SUBMITTED} dot="bg-blue-500" />
            <Tile label="Under review" value={stats.byStatus.UNDER_REVIEW} dot="bg-orange-500" />
            <Tile label="Approved" value={stats.byStatus.APPROVED} dot="bg-green-500" />
            <Tile label="Rejected" value={stats.byStatus.REJECTED} dot="bg-red-500" />
            <Tile label="Expired" value={stats.byStatus.EXPIRED} dot="bg-gray-400" />
            <Tile label="Cancelled" value={stats.byStatus.CANCELLED} dot="bg-gray-300" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Revenue */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
                <Wallet className="h-4 w-4 text-brand-600" /> Service fees
              </h3>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.currency} {(stats.revenueCollected / 100).toLocaleString()}</p>
                <p className="text-xs text-green-800 inline-flex items-center gap-1 mt-1"><CheckCircle2 className="h-3 w-3" /> Applications recorded as paid</p>
              </div>
              <div className="pt-2 border-t border-gray-50">
                <p className="text-lg font-semibold text-gray-700">{stats.currency} {(stats.pendingPayment / 100).toLocaleString()}</p>
                <p className="text-xs text-orange-800 inline-flex items-center gap-1 mt-1"><PauseCircle className="h-3 w-3" /> Not yet paid (open applications)</p>
              </div>
              <p className="text-xs text-gray-600">Payment status comes from payments recorded in Finance.</p>
              {canFinance && (
                <Link href="/finance" className="text-xs text-brand-500 font-medium hover:underline inline-flex items-center gap-1">
                  Go to finance <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* Marketplace */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
                <Store className="h-4 w-4 text-purple-600" /> Marketplace
              </h3>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.activeListings}</p>
                <p className="text-xs text-gray-600 mt-1">Active visa-service listings</p>
              </div>
              <div className="pt-2 border-t border-gray-50">
                <p className="text-lg font-semibold text-gray-700">{stats.openServiceRequests}</p>
                <p className="text-xs text-blue-600 mt-1">Open visa requests from travelers on the marketplace</p>
              </div>
              {canMarketplace && (
                <Link href="/visa-requests" className="text-xs text-brand-500 font-medium hover:underline inline-flex items-center gap-1">
                  Answer marketplace requests <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* Recent activity */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" /> Recent activity
              </h3>
              {(stats.recentActivity ?? []).length === 0 ? (
                <p className="text-xs text-gray-600">No recent activity</p>
              ) : (
                <ul className="space-y-2">
                  {stats.recentActivity.map((a: any) => (
                    <li key={a.id}>
                      <Link href={`/compliance/${a.id}`} className="flex items-center justify-between text-xs hover:text-brand-600">
                        <span className="font-medium text-gray-900 truncate">{a.applicantName ?? a.applicationNumber ?? a.id.slice(0, 8)}</span>
                        <span className="text-xs text-gray-600">{a.status?.replace(/_/g, ' ')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Quick navigation */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Quick navigation</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <QuickAction href="/compliance" label="Applications" icon={FileCheck2} bg="bg-brand-50 text-brand-600" />
              {can('crm:pilgrim:read') && <QuickAction href="/pilgrims" label="Applicants" icon={Users} bg="bg-blue-50 text-blue-600" />}
              <QuickAction href="/visa-documents" label="Documents" icon={FolderOpen} bg="bg-yellow-50 text-yellow-800" />
              <QuickAction href="/visa-requests" label="Service Requests" icon={Send} bg="bg-purple-50 text-purple-600" />
              {can('marketplace:listing:read') && <QuickAction href="/marketplace" label="Marketplace" icon={Store} bg="bg-pink-50 text-pink-600" />}
              {canFinance && <QuickAction href="/finance" label="Finance" icon={Wallet} bg="bg-green-50 text-green-800" />}
              {can('reporting:report:read') && <QuickAction href="/reports" label="Reports" icon={BarChart3} bg="bg-blue-50 text-blue-700" />}
              <QuickAction href="/social" label="Social Hub" icon={MessageSquare} bg="bg-saudi-50 text-saudi-700" />
              <QuickAction href="/connections" label="Connections" icon={Users} bg="bg-blue-50 text-blue-700" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}





function QuickAction({ href, label, icon: Icon, bg }: { href: string; label: string; icon: any; bg: string }) {
  return (
    <Link href={href} className="group flex flex-col items-center text-center bg-white border border-gray-200 rounded-xl p-3 hover:border-brand-200 hover:shadow-sm transition-all">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-2', bg)}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-medium text-gray-700 group-hover:text-brand-700">{label}</p>
    </Link>
  );
}
