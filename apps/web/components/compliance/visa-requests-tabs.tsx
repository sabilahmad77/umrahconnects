'use client';

import { useState } from 'react';
import { Inbox, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VisaRequestQueue } from './visa-request-queue';
import { VisaRequestsView } from './visa-requests-view';

/**
 * Two distinct inboxes live on this route:
 *  · Service tickets  — work the visa desk owns (this is the ticket workflow)
 *  · Marketplace demand — open VISA requests from other tenants to bid on
 */
export function VisaRequestsTabs() {
  const [tab, setTab] = useState<'tickets' | 'marketplace'>('tickets');

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5" role="tablist" aria-label="Visa request inboxes">
        <button
          role="tab"
          aria-selected={tab === 'tickets'}
          onClick={() => setTab('tickets')}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-full border font-medium transition-all',
            tab === 'tickets' ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:border-gray-300',
          )}
        >
          <Inbox className="h-3.5 w-3.5" /> Service tickets
        </button>
        <button
          role="tab"
          aria-selected={tab === 'marketplace'}
          onClick={() => setTab('marketplace')}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-full border font-medium transition-all',
            tab === 'marketplace' ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:border-gray-300',
          )}
        >
          <Store className="h-3.5 w-3.5" /> Marketplace demand
        </button>
      </div>

      {tab === 'tickets' ? <VisaRequestQueue /> : <VisaRequestsView />}
    </div>
  );
}
