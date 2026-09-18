'use client';
import { useMemo, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { apiClient } from '@/lib/api';
import { Alert, Button } from '@/components/ui/system';

function CardForm({paymentId,checkout,onReconciled}:{paymentId:string;checkout:boolean;onReconciled:(result:any)=>void}){
 const stripe=useStripe();const elements=useElements();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const pay=async(e:React.FormEvent)=>{e.preventDefault();if(!stripe||!elements||busy)return;setBusy(true);setError('');try{
  const url=new URL(window.location.href);url.searchParams.set(checkout?'checkout':'payment',paymentId);
  const result=await stripe.confirmPayment({elements,confirmParams:{return_url:url.toString()},redirect:'if_required'});
  if(result.error){setError(result.error.message||'Your payment could not be submitted.');return;}
  const response=checkout ? await apiClient.get(`/payments/checkout/${paymentId}`) : await apiClient.post(`/payments/intents/${paymentId}/confirm`,{});
  onReconciled(response.data.data);
 }catch(e:any){setError(e?.response?.data?.error?.message||'Unable to confirm payment status. Check status before trying again.');}finally{setBusy(false);}};
 return <form method="post" onSubmit={pay} className="space-y-4"><PaymentElement onLoadError={()=>setError('The secure payment form could not load. Try again.')} />{error&&<Alert title="Payment requires attention">{error}</Alert>}<Button type="submit" busy={busy} disabled={!stripe||!elements}>Submit payment securely</Button><p className="text-xs text-gray-600">Payment status is confirmed by the server. Submission alone does not mark your booking or invoice paid.</p></form>;
}
export default function CardPayment({publishableKey,clientSecret,paymentId,checkout=false,onReconciled}:{publishableKey:string;clientSecret:string;paymentId:string;checkout?:boolean;onReconciled:(result:any)=>void}){
 const stripe=useMemo(()=>loadStripe(publishableKey),[publishableKey]);
 return <Elements key={clientSecret} stripe={stripe} options={{clientSecret,appearance:{theme:'stripe',variables:{colorPrimary:'#0F3D37',borderRadius:'8px',fontFamily:'Inter, sans-serif'}}}}><CardForm paymentId={paymentId} checkout={checkout} onReconciled={onReconciled} /></Elements>;
}
