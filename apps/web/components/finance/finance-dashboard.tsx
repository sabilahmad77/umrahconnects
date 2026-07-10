'use client';

import Link from 'next/link';
import {
  Wallet, FileText, FileClock, FileCheck2, FileX2, PauseCircle, AlertTriangle,
  CreditCard, ClipboardList, Percent, RefreshCw, ArrowRight, Loader2, AlertCircle,
  BookOpen, Receipt, TrendingUp, Store, MessageSquare, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFinanceDashboardStats } from '@/hooks/use-finance';

const fmt = (cents: number, cur = 'SAR') => `${cur} ${(cents / 100).toLocaleString()}`;

export function FinanceDashboard() {
  const { data: stats, isLoading, error, refetch } = useFinanceDashboardStats();

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance operations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Invoices, payments, budget plans, commission and revenue</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
          <Link href="/finance" className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 shadow-sm shadow-brand-500/30">
            <FileText className="h-4 w-4" /> New invoice
          </Link>
        </div>
      </div>

      {error ? (
        <div className="py-10 text-center bg-white rounded-2xl border border-gray-100">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-sm text-red-500">Failed to load finance stats</p>
        </div>
      ) : isLoading || !stats ? (
        <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading dashboard…
        </div>
      ) : (
        <>
          {/* Hero KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Revenue collected" value={fmt(stats.paid.amountCents, stats.currency)} sub={`${stats.paid.count} paid invoices`} icon={Wallet} color="bg-green-50 text-green-700" href="/finance" />
            <KPI label="Outstanding" value={fmt(stats.outstanding.amountCents, stats.currency)} sub={`${stats.outstanding.count} unpaid`} icon={PauseCircle} color="bg-orange-50 text-orange-700" href="/finance" />
            <KPI label="Commission earned" value={fmt(stats.commissionEarnedCents, stats.currency)} sub={`${stats.budgetPlans.active} active plans`} icon={Percent} color="bg-purple-50 text-purple-700" href="/budget-plans" />
            <KPI label="Financed bookings" value={stats.financedBookings} sub="linked to invoices" icon={BookOpen} color="bg-blue-50 text-blue-700" href="/bookings" />
          </div>

          {/* Invoice status tiles */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <Tile label="Draft" value={stats.draft.count} dot="bg-gray-400" />
            <Tile label="Sent / issued" value={stats.sentCount} dot="bg-blue-500" />
            <Tile label="Partial" value={stats.partialCount} dot="bg-yellow-500" />
            <Tile label="Paid" value={stats.paid.count} dot="bg-green-500" />
            <Tile label="Overdue" value={stats.overdueCount} dot="bg-red-500" />
            <Tile label="Budget plans" value={stats.budgetPlans.total} dot="bg-purple-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Revenue breakdown */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-brand-600" /> Revenue
              </h3>
              <div>
                <p className="text-2xl font-bold text-gray-900">{fmt(stats.paid.amountCents, stats.currency)}</p>
                <p className="text-xs text-green-600 inline-flex items-center gap-1 mt-1"><FileCheck2 className="h-3 w-3" /> Collected</p>
              </div>
              <div className="pt-2 border-t border-gray-50">
                <p className="text-lg font-semibold text-gray-700">{fmt(stats.outstanding.amountCents, stats.currency)}</p>
                <p className="text-xs text-orange-500 inline-flex items-center gap-1 mt-1"><PauseCircle className="h-3 w-3" /> Outstanding</p>
              </div>
              <div className="pt-2 border-t border-gray-50">
                <p className="text-lg font-semibold text-gray-700">{fmt(stats.draft.amountCents, stats.currency)}</p>
                <p className="text-xs text-gray-500 inline-flex items-center gap-1 mt-1"><FileClock className="h-3 w-3" /> Draft invoices</p>
              </div>
            </div>

            {/* Budget plans */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-purple-600" /> Budget plans
              </h3>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.budgetPlans.total}</p>
                <p className="text-xs text-gray-500 mt-1">Total plans</p>
              </div>
              <div className="pt-2 border-t border-gray-50">
                <p className="text-lg font-semibold text-gray-700">{stats.budgetPlans.active}</p>
                <p className="text-xs text-purple-600 mt-1">Active (proposed / accepted)</p>
              </div>
              <Link href="/budget-plans" className="text-xs text-brand-500 font-medium hover:underline inline-flex items-center gap-1">
                Manage budget plans <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Recent transactions */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-600" /> Recent transactions
              </h3>
              {(stats.recentTransactions ?? []).length === 0 ? (
                <p className="text-xs text-gray-500">No payments recorded yet</p>
              ) : (
                <ul className="space-y-2">
                  {stats.recentTransactions.map((t: any) => (
                    <li key={t.id} className="flex items-center justify-between text-xs border-b border-gray-50 pb-2 last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{t.counterparty ?? t.invoiceRef ?? 'Payment'}</p>
                        <p className="text-[11px] text-gray-500">{t.gateway} · {t.status}</p>
                      </div>
                      <span className="text-xs font-semibold text-gray-900 shrink-0">{fmt(t.amountCents, stats.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/finance-payments" className="text-xs text-brand-500 font-medium hover:underline inline-flex items-center gap-1 mt-3">
                All payments <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* Quick navigation */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Quick navigation</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <QuickAction href="/finance" label="Invoices" icon={FileText} bg="bg-brand-50 text-brand-600" />
              <QuickAction href="/finance-payments" label="Payments" icon={CreditCard} bg="bg-blue-50 text-blue-600" />
              <QuickAction href="/bookings" label="Bookings" icon={BookOpen} bg="bg-green-50 text-green-600" />
              <QuickAction href="/budget-plans" label="Budget Plans" icon={ClipboardList} bg="bg-purple-50 text-purple-600" />
              <QuickAction href="/reports" label="Reports" icon={Receipt} bg="bg-yellow-50 text-yellow-600" />
              <QuickAction href="/marketplace" label="Marketplace" icon={Store} bg="bg-pink-50 text-pink-600" />
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
        <p className="text-lg font-bold text-gray-900 leading-tight mt-1 truncate">{typeof value === 'number' ? value.toLocaleString() : value}</p>
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
