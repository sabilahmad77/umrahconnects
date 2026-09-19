'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Alert, Button, Card, EmptyState, LoadingState, PageHeader, QueryFailure } from '@/components/ui/system';
import { useAuthContext } from '@/components/providers/auth-provider';
import { useCapabilities } from '@/hooks/use-capabilities';
import { apiClient } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { loadSessionUser } from '@/lib/session';
import { OrganizationForm } from './organization-form';
import { KycPanel, useKycHistory } from './kyc-panel';
import { submissionState } from './organization-rules';

/**
 * /onboarding. What it shows depends on the account, never on a role name:
 *  - a traveler whose email is not confirmed: why and how to confirm it;
 *  - a verified traveler: the form to register an organization;
 *  - an organization being verified: its KYC status, uploads and history;
 *  - an active organization: its verification record;
 *  - a platform account: that organizations are managed from the console.
 */
export function OnboardingWorkspace() {
  const { user } = useAuthContext();
  const { kind, pending, landingPath } = useCapabilities();
  if (!user || !kind) return <LoadingState label="Loading your account…" />;

  if (kind === 'platform') {
    return (
      <Page title="Organization onboarding" description="Organizations register themselves; the platform reviews them.">
        <Card>
          <h2 className="text-lg font-semibold">Platform accounts do not register organizations</h2>
          <p className="mt-2 text-sm text-gray-600">
            Review organizations that have registered, and their verification documents, from the platform console.
          </p>
          <Link href="/admin-kyc" className="uc-button uc-button-primary mt-5">
            Open KYC review
          </Link>
        </Card>
      </Page>
    );
  }

  if (kind === 'traveler') {
    return (
      <Page
        title="Register your organization"
        description="Run your agency, hotel, transport company or visa agency on Umrah Connect."
      >
        {user.emailVerified === false ? <VerificationGate /> : <OrganizationForm />}
      </Page>
    );
  }

  if (pending) {
    return (
      <Page
        title="Organization verification"
        description="Your organization’s workspace opens once Umrah Connect has verified its documents."
      >
        <KycPanel />
      </Page>
    );
  }

  return (
    <Page title="Organization verification" description="The verification record of your organization.">
      <VerifiedOrganization homeHref={landingPath ?? '/settings'} />
    </Page>
  );
}

function Page({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={title} description={description} />
      {children}
    </div>
  );
}

/**
 * Registering an organization needs a confirmed email address (the API
 * refuses it otherwise). Say so plainly and offer the way to confirm it.
 */
function VerificationGate() {
  const { user, setUser } = useAuthContext();
  const [busy, setBusy] = useState<'send' | 'check' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const send = async () => {
    setBusy('send');
    setError('');
    setMessage('');
    try {
      const { data } = await apiClient.post('/auth/verify-email/request', {});
      if (data?.data?.alreadyVerified) {
        setUser(await loadSessionUser());
        return;
      }
      setMessage(
        data?.data?.delivered === true
          ? `A confirmation link was sent to ${user?.email}. Open it, then come back here.`
          : 'Email delivery is unavailable right now. Contact support to confirm your address.',
      );
    } catch (e) {
      setError(apiErrorMessage(e, 'The confirmation email could not be requested. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy('check');
    setError('');
    try {
      const next = await loadSessionUser();
      setUser(next);
      if (next.emailVerified !== true) setMessage('Your email address is not confirmed yet. Open the link in the email first.');
    } catch (e) {
      setError(apiErrorMessage(e, 'Your account could not be checked. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold">Confirm your email address first</h2>
      <p className="mt-2 text-sm text-gray-600">
        An organization is registered by a person with a confirmed email address, so Umrah Connect can reach whoever
        is responsible for it. Confirm {user?.email ? <strong>{user.email}</strong> : 'your email address'} to continue.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button busy={busy === 'send'} disabled={!!busy} onClick={send}>
          Send confirmation email
        </Button>
        <Button variant="secondary" busy={busy === 'check'} disabled={!!busy} onClick={check}>
          I have confirmed it
        </Button>
      </div>
      {message && (
        <p role="status" className="mt-4 text-sm text-gray-700">
          {message}
        </p>
      )}
      {error && (
        <div className="mt-4">
          <Alert title="Something went wrong">{error}</Alert>
        </div>
      )}
    </Card>
  );
}

function VerifiedOrganization({ homeHref }: { homeHref: string }) {
  const { user } = useAuthContext();
  const { can } = useCapabilities();
  const history = useKycHistory(can('core:tenant:read'), false);
  const approved = (history.data ?? []).find((record) => submissionState(record) === 'approved');

  return (
    <Card>
      <h2 className="text-lg font-semibold">{user?.tenantName} is verified</h2>
      <p className="mt-2 text-sm text-gray-600">
        {approved?.verifiedAt
          ? `Umrah Connect approved its verification on ${new Date(approved.verifiedAt).toLocaleString()}.`
          : 'The organization is active on Umrah Connect.'}
      </p>
      {history.error && (
        <div className="mt-4">
          <QueryFailure error={history.error} onRetry={() => void history.refetch().catch(() => toast.error('Try again.'))} />
        </div>
      )}
      {!history.error && history.data?.length === 0 && (
        <EmptyState title="No verification record" description="This organization was set up by the platform team." />
      )}
      <Link href={homeHref} className="uc-button uc-button-primary mt-5">
        Go to your workspace
      </Link>
    </Card>
  );
}
