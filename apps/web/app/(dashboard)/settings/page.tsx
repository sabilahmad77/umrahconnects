'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/providers/auth-provider';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useAccountProfile, useGoogleSignInStatus, usePreferences } from '@/hooks/use-auth';
import { googleErrorMessage, type GoogleMessage } from '@/lib/google-sign-in';
import { formatInTimeZone } from '@/lib/preferences';
import { Alert, Badge, Card, LoadingState, PageHeader, QueryFailure } from '@/components/ui/system';
import { ChangePasswordForm, SetPasswordPanel, SignOutEverywhere } from '@/components/settings/security-section';
import { LinkedAccounts } from '@/components/settings/linked-accounts';
import { PreferencesSection } from '@/components/settings/preferences-section';

const COMMUNITY_SLUG = 'umrah-connect-travelers';

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuthContext();
  const { ready, can, isPlatform } = useCapabilities();
  const profile = useAccountProfile();
  const preferences = usePreferences();
  const google = useGoogleSignInStatus();
  const [notice, setNotice] = useState<GoogleMessage | null>(null);

  // Result of a Google linking round trip (/settings?linked=google or ?linkError=…),
  // shown once and removed from the address so a reload does not repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('linked') === 'google') {
      setNotice({ tone: 'info', title: 'Google account linked', body: 'You can now sign in with Google as well.' });
    } else if (params.get('linkError')) {
      setNotice(googleErrorMessage(params.get('linkError'), 'link'));
    }
    if (params.has('linked') || params.has('linkError')) router.replace('/settings');
  }, [router]);

  const timeZone = preferences.data?.timezone ?? 'Asia/Riyadh';

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Account settings" description="Your sign-in methods, security and preferences." />

      {notice && (
        <Alert tone={notice.tone} title={notice.title}>
          {notice.body}
        </Alert>
      )}

      <Card>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="mt-2 text-sm text-gray-600">Manage your name, photo, contact details and profile privacy using your saved profile.</p>
        <Link href="/profile" className="uc-button uc-button-primary mt-5">
          Edit profile
        </Link>
      </Card>

      <Card className="space-y-8">
        <div>
          <h2 className="text-lg font-semibold">Sign-in and security</h2>
          {profile.data && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span>{profile.data.email}</span>
              <Badge tone={profile.data.emailVerified ? 'success' : 'warning'}>{profile.data.emailVerified ? 'Email confirmed' : 'Email not confirmed'}</Badge>
              <span>· Account created {formatInTimeZone(profile.data.createdAt, timeZone)}</span>
            </p>
          )}
        </div>
        {profile.isLoading && <LoadingState label="Loading your account…" />}
        {profile.error && <QueryFailure error={profile.error} onRetry={() => void profile.refetch()} />}
        {profile.data && (
          <>
            {profile.data.hasPassword ? <ChangePasswordForm /> : <SetPasswordPanel email={profile.data.email ?? ''} />}
            <LinkedAccounts profile={profile.data} timeZone={timeZone} google={google.data} canLinkGoogle={ready && !isPlatform} />
            <SignOutEverywhere />
          </>
        )}
      </Card>

      <Card>
        <h2 id="preferences-title" className="mb-5 text-lg font-semibold">
          Preferences
        </h2>
        <PreferencesSection />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Workspace</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {[
            ['Account', user?.email],
            ['Workspace', user?.tenantName],
            ['Workspace type', user?.tenantType],
            ['Account role', user?.dashboardType],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-gray-600">{label}</dt>
              <dd className="mt-1 break-words text-sm">{value || 'Not provided'}</dd>
            </div>
          ))}
        </dl>
        {ready && can('core:tenant:update') && (
          <Link href="/onboarding" className="uc-button uc-button-secondary mt-5">
            Organization profile and verification
          </Link>
        )}
        {ready && user?.tenantSlug === COMMUNITY_SLUG && (
          <div className="mt-5 space-y-2">
            <Link href="/onboarding" className="uc-button uc-button-secondary">
              Register an organization
            </Link>
            {!user.emailVerified && <p className="text-xs text-gray-600">Confirm your email address first — registering an organization requires it.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
