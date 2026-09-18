'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { acceptSession } from '@/lib/session';
import { safeReturnPath } from '@/lib/safe-return-path';
import { useAuthContext, getDashboardPath } from '@/components/providers/auth-provider';
import { Alert, LoadingState } from '@/components/ui/system';
export default function AuthCallbackPage() {
 const started = useRef(false); const [error, setError] = useState(''); const router = useRouter(); const { setUser } = useAuthContext();
 useEffect(() => {
  if (started.current) return; started.current = true;
  const fragment = new URLSearchParams(window.location.hash.slice(1)); const ticket = fragment.get('ticket'); const returnTo = safeReturnPath(fragment.get('returnTo'));
  window.history.replaceState(null, '', '/auth/callback');
  if (!ticket) { setError('The sign-in link is missing or expired. Start Google sign-in again.'); return; }
  void (async () => { try { const {data} = await apiClient.post('/auth/google/exchange', {ticket}); const user = await acceptSession(data.data.accessToken); setUser(user); router.replace(returnTo ?? getDashboardPath(user.dashboardType)); } catch(e:any) { setError(e?.response?.data?.error?.message || 'Google sign-in could not be completed. Return to sign in and try again.'); } })();
 }, [router, setUser]);
 return <main className="mx-auto max-w-lg space-y-5 px-4 py-16"><h1 className="text-2xl font-semibold">Complete sign-in</h1>{error ? <><Alert title="Unable to sign in">{error}</Alert><Link href="/login" className="uc-button uc-button-primary">Back to sign in</Link></> : <LoadingState label="Completing Google sign-in…" />}</main>;
}
