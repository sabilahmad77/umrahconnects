'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth, useGoogleSignInStatus } from '@/hooks/use-auth';
import { useAuthContext } from '@/components/providers/auth-provider';
import { landingPathFor } from '@/lib/workspace-access';
import { Brandmark } from '@/components/public/public-chrome';
import { Alert, Button, Input, Select } from '@/components/ui/system';
import { GoogleButton, OrDivider, StubGoogleNotice } from '@/components/settings/google-button';
import { apiClient } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { safeReturnPath } from '@/lib/safe-return-path';
import { googleErrorMessage, googleStartUrl, type GoogleMessage } from '@/lib/google-sign-in';
import { signInNotice } from '@/lib/session';

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuth();
  const { setUser } = useAuthContext();
  const google = useGoogleSignInStatus();

  const [ready, setReady] = useState(false);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [notice, setNotice] = useState<GoogleMessage | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tenantId, setTenantId] = useState('');

  // Query parameters are read after mount: this page is statically rendered.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(safeReturnPath(params.get('returnTo')));
    setNotice(googleErrorMessage(params.get('error')) ?? signInNotice(params.get('reason')));
    setReady(true);
  }, []);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading) return;
    setError('');
    setResetMessage('');
    try {
      const user = await login(email.trim(), password, tenantId || undefined);
      setUser(user);
      router.push(returnTo ?? landingPathFor(user));
    } catch (e: any) {
      const detail = e?.response?.data?.error;
      const choices = detail?.details?.tenants ?? detail?.tenants;
      if (detail?.code === 'TENANT_REQUIRED' && Array.isArray(choices)) {
        // Not a failure: the same email and password exist in several workspaces.
        setWorkspaces(choices);
        return;
      }
      setError(apiErrorMessage(e, 'Sign-in failed. Check your details and try again.'));
    }
  };

  const forgot = async () => {
    if (resetBusy) return;
    setError('');
    setResetMessage('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Enter your account email address first.');
      return;
    }
    setResetBusy(true);
    try {
      const { data } = await apiClient.post('/auth/forgot-password', { email: email.trim() });
      setResetMessage(data?.data?.message || 'If this email is registered, check your inbox for the reset instructions.');
    } catch (e) {
      // 503 when email delivery is not configured: the server says so, and so do we.
      setError(apiErrorMessage(e, 'Reset instructions could not be requested. Try again.'));
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col bg-ivory px-4 py-8">
      <div className="mx-auto w-full max-w-6xl">
        <Brandmark />
      </div>
      <div className="mx-auto my-auto grid w-full max-w-5xl gap-12 py-12 lg:grid-cols-2 lg:items-center">
        <div className="hidden lg:block">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">Connected journeys</p>
          <p className="mt-5 text-4xl font-bold leading-tight text-brand-600">
            Your journey.
            <br />
            Your workspace.
          </p>
          <p className="mt-5 max-w-sm text-base leading-7 text-gray-600">
            Sign in to continue your bookings, requests and conversations. Your account determines the workspace you can access.
          </p>
          <Link href="/solutions" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">
            Explore the platform
          </Link>
        </div>

        <section className="uc-card mx-auto w-full max-w-md p-6 sm:p-8" aria-labelledby="signin-title">
          <h1 id="signin-title" className="text-2xl font-bold text-brand-600">
            Sign in to Umrah Connect
          </h1>
          <p className="mt-2 text-sm text-gray-600">Use your account email and password{google.data?.enabled ? ', or your Google account' : ''}.</p>

          {notice && (
            <div className="mt-5">
              <Alert tone={notice.tone} title={notice.title}>
                {notice.body}
              </Alert>
            </div>
          )}

          {google.data?.enabled && (
            <div className="mt-6">
              <GoogleButton href={googleStartUrl(returnTo)} />
              {google.data.mode === 'local-stub' && <StubGoogleNotice />}
              <OrDivider />
            </div>
          )}

          <form method="post" onSubmit={signIn} className={google.data?.enabled ? 'space-y-5' : 'mt-7 space-y-5'}>
            <div>
              <label htmlFor="signin-email" className="mb-2 block text-sm font-medium">
                Email address
              </label>
              <Input
                id="signin-email"
                type="email"
                name="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setWorkspaces([]);
                  setTenantId('');
                }}
              />
            </div>
            <div>
              <label htmlFor="signin-password" className="mb-2 block text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <Input
                  id="signin-password"
                  type={visible ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-14"
                />
                <Button
                  variant="quiet"
                  className="absolute right-0 top-0 px-3"
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button variant="quiet" disabled={resetBusy} busy={resetBusy} onClick={forgot} className="mt-1 px-0 text-brand-700">
                Forgot password?
              </Button>
            </div>

            {workspaces.length > 0 && (
              <div className="space-y-3">
                <Alert tone="info" title="Choose a workspace">
                  This email and password open more than one workspace. Choose the one to sign in to, then sign in again.
                </Alert>
                <div>
                  <label htmlFor="signin-workspace" className="mb-2 block text-sm font-medium">
                    Workspace
                  </label>
                  <Select id="signin-workspace" value={tenantId} required onChange={(e) => setTenantId(e.target.value)}>
                    <option value="">Choose workspace</option>
                    {workspaces.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.slug})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            )}

            {error && <Alert title="Unable to continue">{error}</Alert>}
            {resetMessage && (
              <Alert tone="info" title="Password reset requested">
                {resetMessage}
              </Alert>
            )}
            <Button type="submit" disabled={!ready} busy={isLoading} className="w-full">
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-sm text-gray-600">
            New to Umrah Connect?{' '}
            <Link href="/signup" className="font-semibold text-brand-700 underline">
              Create an account
            </Link>
          </p>
          <div className="mt-6 flex flex-wrap gap-4 border-t border-gray-200 pt-5 text-xs text-gray-600">
            <Link href="/help">Help center</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
