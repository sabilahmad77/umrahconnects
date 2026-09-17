'use client';
import { Button , QueryFailure } from '@/components/ui/system';

import Link from 'next/link';
import { Send, RefreshCw, AlertCircle, Loader2, Inbox, MapPin, Calendar, Users, Wallet, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOpenRequests } from '@/hooks/use-platform';

/**
 * Visa service requests — marketplace requests of type VISA that the agency
 * can review and respond to with offers. Accepted offers convert to a
 * visa application via the request detail page.
 */
export function VisaRequestsView() {
  const { data, isLoading, error, refetch } = useOpenRequests({ serviceType: 'VISA' });
  const items = data?.items ?? [];

  if (error) return <QueryFailure error={error} onRetry={() => { refetch(); }} />;
  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visa service requests</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {items.length} open request{items.length === 1 ? '' : 's'} — send an offer, then convert accepted offers into applications
          </p>
        </div>
        <Button variant="quiet" type="button" aria-label="Refresh information" onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <Inbox className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-600">No open visa service requests right now</p>
          <Link href="/marketplace" className="text-xs text-brand-500 hover:underline mt-2 inline-block">Browse the marketplace →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((r: any) => (
            <Link
              key={r.id}
              href={`/requests/${r.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-brand-200 transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-bold text-gray-900">{r.title}</p>
                <span className={cn('text-xs font-medium px-2 py-1 rounded-full',
                  r.status === 'OPEN' ? 'bg-blue-50 text-blue-700' : 'bg-yellow-50 text-yellow-700')}>{r.status}</span>
              </div>
              {r.description && <p className="text-xs text-gray-600 line-clamp-2 mb-3">{r.description}</p>}
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                {r.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {r.city}</span>}
                {r.travelers && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {r.travelers} traveler(s)</span>}
                {r.dateFrom && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(r.dateFrom).toLocaleDateString()}</span>}
                {r.budgetMaxCents != null && (
                  <span className="inline-flex items-center gap-1"><Wallet className="h-3 w-3" /> up to {r.currency} {(Number(r.budgetMaxCents) / 100).toLocaleString()}</span>
                )}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                <span className="text-xs text-gray-600">{r.offers?.length ?? 0} offer(s)</span>
                <span className="text-xs text-brand-600 font-medium inline-flex items-center gap-1">
                  <Send className="h-3 w-3" /> Open &amp; respond <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
