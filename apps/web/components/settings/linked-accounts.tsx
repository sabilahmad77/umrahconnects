'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { googleLinkUrl } from '@/lib/google-sign-in';
import { formatInTimeZone } from '@/lib/preferences';
import type { AccountProfile } from '@/hooks/use-auth';
import { Alert, Badge } from '@/components/ui/system';
import { GoogleButton, GoogleMark, StubGoogleNotice } from './google-button';

/**
 * Sign-in methods on the account (`GET /auth/me` → identities), and linking
 * Google: `POST /auth/google/link-intent` → full-page navigation to Google →
 * back to /settings?linked=google (or ?linkError=…).
 */
export function LinkedAccounts({
  profile,
  timeZone,
  google,
  canLinkGoogle,
}: {
  profile: AccountProfile;
  timeZone: string;
  google: { enabled: boolean; mode: 'google' | 'local-stub' } | undefined;
  canLinkGoogle: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const googleIdentities = profile.identities.filter((identity) => identity.provider === 'google');

  const link = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await apiClient.post('/auth/google/link-intent', {});
      window.location.assign(googleLinkUrl(data.data.intent));
    } catch (e) {
      setError(apiErrorMessage(e, 'Google linking could not be started. Try again.'));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" aria-labelledby="sign-in-methods-title">
      <h3 id="sign-in-methods-title" className="text-base font-semibold">
        Sign-in methods
      </h3>
      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
        <li className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span>
            <span className="font-medium">Email and password</span>
            <span className="block break-all text-gray-600">{profile.email}</span>
          </span>
          <Badge tone={profile.hasPassword ? 'success' : 'neutral'}>{profile.hasPassword ? 'Password set' : 'No password'}</Badge>
        </li>
        {googleIdentities.map((identity) => (
          <li key={`${identity.provider}-${identity.createdAt}`} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span className="flex items-center gap-3">
              <GoogleMark />
              <span>
                <span className="font-medium">Google</span>
                <span className="block text-gray-600">
                  {identity.email ?? 'Google account'} · linked {formatInTimeZone(identity.createdAt, timeZone)}
                </span>
              </span>
            </span>
            <Badge tone="success">Linked</Badge>
          </li>
        ))}
      </ul>
      {canLinkGoogle && google?.enabled && googleIdentities.length === 0 && (
        <div className="max-w-sm">
          <GoogleButton label="Link your Google account" onClick={link} busy={busy} />
          {google.mode === 'local-stub' && <StubGoogleNotice />}
        </div>
      )}
      {error && <Alert title="Google not linked">{error}</Alert>}
    </div>
  );
}
