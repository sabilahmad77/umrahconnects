'use client';

import Link from 'next/link';
import { Loader2, AlertCircle, MessageSquare, Wallet, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useMyRequests, useAcceptOffer, useRejectOffer } from '@/hooks/use-platform';
import { useConvertOfferToBooking } from '@/hooks/use-marketplace-requests';

export function MyOffersView() {
  const { data, isLoading, error, refetch } = useMyRequests();
  const accept = useAcceptOffer();
  const reject = useRejectOffer();
  const convert = useConvertOfferToBooking();

  const requests = data?.items ?? [];
  const offersCount = requests.reduce((acc: number, r: any) => acc + (r.offers?.length ?? 0), 0);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-gray-400 text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;
  }
  if (error) {
    return <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
      <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
      <p className="text-sm text-red-500">Failed to load offers</p>
    </div>;
  }

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My offers received</h1>
        <p className="text-sm text-gray-500 mt-0.5">{offersCount} offers across {requests.length} requests.</p>
      </div>

      {requests.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">No requests yet</p>
          <Link href="/requests" className="text-xs text-brand-500 hover:underline mt-2 inline-block">Create your first request →</Link>
        </div>
      ) : (
        requests.map((r: any) => (
          <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <Link href={`/requests/${r.id}`} className="text-base font-bold text-gray-900 hover:text-brand-600">
                  {r.title}
                </Link>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {r.serviceType} {r.city && `· ${r.city}`} {r.travelers && `· ${r.travelers} travelers`} · {r.status}
                </p>
              </div>
              <Link href={`/requests/${r.id}`} className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1">
                Open <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {(r.offers ?? []).length === 0 ? (
              <p className="text-xs text-gray-400">No offers yet on this request.</p>
            ) : (
              <ul className="space-y-2">
                {r.offers.map((o: any) => (
                  <li key={o.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{o.title}</p>
                        <p className="text-[11px] text-gray-400">{o.description?.slice(0, 100)}</p>
                      </div>
                      <span className={cn(
                        'text-[11px] font-medium px-2 py-1 rounded-full',
                        o.status === 'PENDING' ? 'bg-blue-50 text-blue-700' :
                        o.status === 'ACCEPTED' ? 'bg-green-50 text-green-700' :
                        o.status === 'REJECTED' ? 'bg-red-50 text-red-600' :
                        'bg-gray-100 text-gray-500',
                      )}>{o.status}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-sm font-bold inline-flex items-center gap-1 text-gray-900">
                        <Wallet className="h-3.5 w-3.5 text-gray-400" />
                        {o.currency} {(Number(o.priceCents) / 100).toLocaleString()}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {o.status === 'PENDING' && (
                          <>
                            <button
                              onClick={async () => {
                                try {
                                  await accept.mutateAsync({ requestId: r.id, offerId: o.id });
                                  toast.success('Offer accepted');
                                  refetch();
                                } catch (e: any) {
                                  toast.error(e?.response?.data?.error?.message ?? 'Failed');
                                }
                              }}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Accept
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await reject.mutateAsync({ requestId: r.id, offerId: o.id });
                                  toast.success('Offer rejected');
                                  refetch();
                                } catch (e: any) {
                                  toast.error(e?.response?.data?.error?.message ?? 'Failed');
                                }
                              }}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"
                            >
                              <XCircle className="h-3 w-3" /> Reject
                            </button>
                          </>
                        )}
                        {o.status === 'ACCEPTED' && (
                          <button
                            onClick={async () => {
                              try {
                                await convert.mutateAsync({ requestId: r.id, offerId: o.id });
                                toast.success('Booking created from offer');
                              } catch (e: any) {
                                toast.error(e?.response?.data?.error?.message ?? 'Failed');
                              }
                            }}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white"
                          >
                            Convert to booking
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}
    </div>
  );
}
