'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { usePaymentProviders } from '@/hooks/use-payments';
import { Alert, Button, LoadingState, QueryFailure } from '@/components/ui/system';
const CardPayment=dynamic(()=>import('@/components/finance/card-payment'),{ssr:false,loading:()=> <LoadingState label="Loading secure payment form…" />});
export function BookingCheckout({bookingId,onChanged}:{bookingId?:string;onChanged:()=>void}){
 const providers=usePaymentProviders();const [intent,setIntent]=useState<any>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const [paymentId,setPaymentId]=useState<string|undefined>(()=>{if(typeof window==='undefined')return;const id=new URLSearchParams(window.location.search).get('checkout');return id&&/^[a-f\d-]{36}$/i.test(id)?id:undefined;});
 const status=useQuery({queryKey:['checkout',paymentId],enabled:!!paymentId,queryFn:async()=> (await apiClient.get(`/payments/checkout/${paymentId}`)).data.data,refetchInterval:query=>query.state.dataUpdateCount<40 && ['PENDING','PROCESSING'].includes(query.state.data?.status)?15000:false});
 const provider=providers.data?.providers.find(p=>p.name===providers.data.active);const usable=provider?.name==='stripe'&&provider.configured&&!!provider.publishableKey;
 const start=async()=>{setBusy(true);setError('');try{const {data}=await apiClient.post('/payments/checkout',{listingBookingId:bookingId});const next=data.data;if(!next.clientSecret||!next.publishableKey)throw new Error('The secure card form is unavailable. Check payment status before retrying.');setPaymentId(next.paymentId);setIntent(next);}catch(e:any){setError(e?.response?.data?.error?.message||e.message||'Payment could not be started.');}finally{setBusy(false);}};
 if(providers.error||status.error)return <QueryFailure error={providers.error||status.error} onRetry={()=>{void providers.refetch();void status.refetch();}} />;
 return <section className="space-y-4">{status.data&&<Alert tone="info" title="Server payment status"><p>{status.data.status} · {status.data.currency} {(status.data.amountCents/100).toLocaleString()}</p><Button variant="secondary" busy={status.isFetching} onClick={()=>{void status.refetch();onChanged();}}>Check payment and booking status</Button></Alert>}{providers.isLoading?<LoadingState label="Checking payment provider…" />: !usable?<Alert tone="info" title="Card payments unavailable">A configured card payment provider is required. No payment has been submitted by this screen.</Alert>: intent?<CardPayment publishableKey={intent.publishableKey} clientSecret={intent.clientSecret} paymentId={intent.paymentId} checkout onReconciled={()=>{void status.refetch();onChanged();}} />:bookingId&&<><p className="text-sm text-gray-600">The server calculates your outstanding booking balance. {provider?.testMode?'The payment provider is in test mode.':''}</p><Button busy={busy} onClick={start}>Continue to secure payment</Button></>}{error&&<Alert title="Payment requires attention">{error}</Alert>}</section>;
}
