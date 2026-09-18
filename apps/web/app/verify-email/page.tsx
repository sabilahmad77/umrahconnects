'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import { Alert, Button } from '@/components/ui/system';
export default function VerifyEmailPage() {
 const [token,setToken]=useState(''); const [ready,setReady]=useState(false); const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
 useEffect(()=>{setToken(new URLSearchParams(window.location.search).get('token') || '');setReady(true);},[]);
 const verify=async()=>{setBusy(true);setError('');try{const {data}=await apiClient.post('/auth/verify-email/confirm',{token});setMessage(data.data.message || 'Email confirmed.');}catch(e:any){setError(e?.response?.data?.error?.message || 'This verification link is invalid or expired.');}finally{setBusy(false);}};
 return <main className="mx-auto max-w-lg space-y-5 px-4 py-16"><h1 className="text-2xl font-semibold text-brand-600">Confirm your email</h1><p className="text-sm text-gray-600">Use the link sent to your account email to complete verification.</p>{message ? <Alert tone="info" title="Email confirmed">{message}</Alert> : ready && !token ? <Alert title="Verification link required">Open the link from your email. You can request another from account settings.</Alert> : <Button busy={busy} disabled={!ready || !token} onClick={verify}>Confirm email</Button>}{error && <Alert title="Unable to verify email">{error}</Alert>}<Link href="/settings" className="uc-button uc-button-secondary">Account settings</Link><Link href="/login" className="inline-flex min-h-11 items-center text-sm underline">Back to sign in</Link></main>;
}
