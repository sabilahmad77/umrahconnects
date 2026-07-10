'use client';

import Link from 'next/link';
import {
  FileCheck2, FilePlus2, Send, FileSearch, CheckCircle2, XCircle, Clock,
  Wallet, PauseCircle, RefreshCw, Plus, ArrowRight, Loader2, AlertCircle,
  Store, MessageSquare, Users, FolderOpen, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVisaDashboardStats } from '@/hooks/use-visa';

export function VisaDashboard() {
  const { data: stats, isLoading, error, refetch } = useVisaDashboardStats();

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visa agency operations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Applications, documents, processing status and revenue</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
          <Link href="/compliance" className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 shadow-sm shadow-brand-500/30">
            <Plus className="h-4 w-4" /> New application
          </Link>
        </div>
      </div>

      {error ? (
        <div className="py-10 text-center bg-white rounded-2xl border border-gray-100">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-sm text-red-500">Failed to load visa stats</p>
        </div>
      ) : isLoading || !stats ? (
        <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading dashboard…
        </div>
      ) : (
        <>
          {/* Hero KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Total applications" value={stats.total} sub={`${stats.newRequests} new requests`} icon={FileCheck2} color="bg-brand-50 text-brand-700" href="/compliance" />
            <KPI label="Under review" value={stats.byStatus.UNDER_REVIEW + stats.byStatus.SUBMITTED} sub="submitted + review" icon={FileSearch} color="bg-blue-50 text-blue-700" href="/compliance" />
            <KPI label="Approved" value={stats.byStatus.APPROVED} sub={`${Math.round((stats.successRate ?? 0) * 100)}% success rate`} icon={CheckCircle2} color="bg-green-50 text-green-700" href="/compliance" />
            <KPI label="Revenue" value={`${stats.currency} ${(stats.revenueCollected / 100).toLocaleString()}`} sub={`${stats.currency} ${(stats.pendingPayment / 100).toLocaleString()} pending`} icon={Wallet} color="bg-saudi-50 text-saudi-700" href="/finance" />
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
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
                <Wallet className="h-4 w-4 text-brand-600" /> Finance
              </h3>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.currency} {(stats.revenueCollected / 100).toLocaleString()}</p>
                <p className="text-xs text-green-600 inline-flex items-center gap-1 mt-1"><CheckCircle2 className="h-3 w-3" /> Collected</p>
              </div>
              <div className="pt-2 border-t border-gray-50">
                <p className="text-lg font-semibold text-gray-700">{stats.currency} {(stats.pendingPayment / 100).toLocaleString()}</p>
                <p className="text-xs text-orange-500 inline-flex items-center gap-1 mt-1"><PauseCircle className="h-3 w-3" /> Pending payment</p>
              </div>
              <Link href="/finance" className="text-xs text-brand-500 font-medium hover:underline inline-flex items-center gap-1">
                Go to finance <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Marketplace */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
                <Store className="h-4 w-4 text-purple-600" /> Marketplace
              </h3>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.activeListings}</p>
                <p className="text-xs text-gray-500 mt-1">Active visa-service listings</p>
              </div>
              <div className="pt-2 border-t border-gray-50">
                <p className="text-lg font-semibold text-gray-700">{stats.openServiceRequests}</p>
                <p className="text-xs text-blue-600 mt-1">Open service requests</p>
              </div>
              <Link href="/visa-requests" className="text-xs text-brand-500 font-medium hover:underline inline-flex items-center gap-1">
                View service requests <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Recent activity */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" /> Recent activity
              </h3>
              {(stats.recentActivity ?? []).length === 0 ? (
                <p className="text-xs text-gray-500">No recent activity</p>
              ) : (
                <ul className="space-y-2">
                  {stats.recentActivity.map((a: any) => (
                    <li key={a.id}>
                      <Link href={`/compliance/${a.id}`} className="flex items-center justify-between text-xs hover:text-brand-600">
                        <span className="font-medium text-gray-900 truncate">{a.applicantName ?? a.applicationNumber ?? a.id.slice(0, 8)}</span>
                        <span className="text-[10px] text-gray-500">{a.status?.replace(/_/g, ' ')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Quick navigation */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Quick navigation</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <QuickAction href="/compliance" label="Applications" icon={FileCheck2} bg="bg-brand-50 text-brand-600" />
              <QuickAction href="/pilgrims" label="Applicants" icon={Users} bg="bg-blue-50 text-blue-600" />
              <QuickAction href="/visa-documents" label="Documents" icon={FolderOpen} bg="bg-yellow-50 text-yellow-600" />
              <QuickAction href="/visa-requests" label="Service Requests" icon={Send} bg="bg-purple-50 text-purple-600" />
              <QuickAction href="/marketplace" label="Marketplace" icon={Store} bg="bg-pink-50 text-pink-600" />
              <QuickAction href="/finance" label="Finance" icon={Wallet} bg="bg-green-50 text-green-600" />
              <QuickAction href="/reports" label="Reports" icon={BarChart3} bg="bg-blue-50 text-blue-700" />
              <QuickAction href="/social" label="Social Hub" icon={MessageSquare} bg="bg-saudi-50 text-saudi-700" />
              <QuickAction href="/connections" label="Connections" icon={Users} bg="bg-blue-50 text-blue-700" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KPI({ label, value, sub, icon: Icon, color, href }: { label: string; value: any; sub?: string; icon: any; color: string; href: string }) {
  return (
    <Link href={href} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md hover:border-brand-200 transition-all flex items-start gap-3">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight mt-1 truncate">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </Link>
  );
}

function Tile({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <div className="flex items-center gap-1.5">
        <span className={cn('w-2 h-2 rounded-full', dot)} />
        <p className="text-[11px] text-gray-500 truncate">{label}</p>
      </div>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function QuickAction({ href, label, icon: Icon, bg }: { href: string; label: string; icon: any; bg: string }) {
  return (
    <Link href={href} className="group flex flex-col items-center text-center bg-white border border-gray-100 rounded-xl p-3 hover:border-brand-200 hover:shadow-sm transition-all">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-2', bg)}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-medium text-gray-700 group-hover:text-brand-700">{label}</p>
    </Link>
  );
}
