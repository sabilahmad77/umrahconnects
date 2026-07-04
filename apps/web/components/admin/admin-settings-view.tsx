'use client';

import { Cog, RefreshCw, Loader2, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminSettings } from '@/hooks/use-admin';

export function AdminSettingsView() {
  const { data: s, isLoading, error, refetch } = useAdminSettings();

  return (
    <div className="space-y-5 pb-10 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Feature flags, marketplace categories, regulatory systems and platform policies</p>
        </div>
        <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-sm text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : error || !s ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-sm text-red-500">Failed to load settings</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Cog className="h-4 w-4" /> Feature flags</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(s.featureFlags ?? {}).map(([k, v]: any) => (
                <div key={k} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-gray-800">{k}</span>
                  {v ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-500" />}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Marketplace categories</h3>
            {(s.marketplaceCategories ?? []).length === 0 ? (
              <p className="text-xs text-gray-400">No listings yet</p>
            ) : (
              <ul className="space-y-1.5">
                {s.marketplaceCategories.map((c: any) => (
                  <li key={c.category} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{c.category.replace(/_/g, ' ')}</span>
                    <span className="font-bold text-gray-900">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Regulatory systems in use</h3>
            {(s.regulatorySystems ?? []).length === 0 ? (
              <p className="text-xs text-gray-400">None</p>
            ) : (
              <ul className="space-y-1.5">
                {s.regulatorySystems.map((c: any) => (
                  <li key={c.system} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{c.system}</span>
                    <span className="font-bold text-gray-900">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Policies</h3>
            <div className="text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Default cancellation window</span>
                <span className="font-bold text-gray-900">{s.policies.cancellationDefaultHours} hours</span>
              </div>
              <div>
                <p className="text-gray-600 mb-1">KYC required for tenant types</p>
                <div className="flex flex-wrap gap-1">
                  {(s.policies.kycRequiredFor ?? []).map((t: string) => (
                    <span key={t} className="text-[11px] bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full">{t.replace(/_/g, ' ')}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
