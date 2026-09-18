'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Link2 } from 'lucide-react';
import { Alert, Button, Card, LoadingState, PageHeader } from '@/components/ui/system';
import { useAuthContext } from '@/components/providers/auth-provider';
import { useAnswerInvitation, usePreviewInvitation, type InvitationPreview } from '@/hooks/use-traveler-links';
import { formatDate, invitationProblem, readInvitationToken } from './link-presentation';

type Phase = 'reading' | 'no-token' | 'checking' | 'ready' | 'problem' | 'accepted' | 'declined';

/**
 * The page a trip invitation email opens (P06, D-022). The token is taken out
 * of the address bar straight away and kept only in memory; the server checks
 * that the signed-in traveler account has verified exactly the invited address
 * before it shows who invited them, and again before it links anything.
 */
export function InvitationResponse() {
  const { user, logout } = useAuthContext();
  const preview = usePreviewInvitation();
  const answer = useAnswerInvitation();
  const token = useRef('');
  const started = useRef(false);
  const [phase, setPhase] = useState<Phase>('reading');
  const [details, setDetails] = useState<InvitationPreview | null>(null);
  const [problem, setProblem] = useState<ReturnType<typeof invitationProblem> | null>(null);

  const fail = (error: unknown) => {
    const body = (error as any)?.response?.data?.error;
    setProblem(invitationProblem(body?.code, typeof body?.message === 'string' ? body.message : undefined));
    setPhase('problem');
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    token.current = readInvitationToken(window.location.search);
    // Keep the single-use token out of the address bar, history and any Referer.
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
    if (!token.current) {
      setPhase('no-token');
      return;
    }
    setPhase('checking');
    // Promise form on purpose: React StrictMode's development remount detaches the
    // mutation observer, and per-call mutate() callbacks would then never fire.
    preview
      .mutateAsync(token.current)
      .then((data) => { setDetails(data); setPhase('ready'); })
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const respond = async (action: 'accept' | 'decline') => {
    try {
      await answer.mutateAsync({ action, token: token.current });
      token.current = '';
      setPhase(action === 'accept' ? 'accepted' : 'declined');
    } catch (error) {
      fail(error);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10">
      <PageHeader title="Trip invitation" description="Link your traveler account to the trip your travel organizer manages for you." />
      {(phase === 'reading' || phase === 'checking') && <Card><LoadingState label="Checking your invitation…" /></Card>}

      {phase === 'no-token' && (
        <Alert title="Invitation link required">
          <p>Open the link from the invitation email your travel organizer sent. The whole link is needed.</p>
          <Link href="/travel-plan" className="mt-3 inline-flex min-h-11 items-center font-semibold underline">Go to my travel plan</Link>
        </Alert>
      )}

      {phase === 'problem' && problem && (
        <Alert title={problem.title}>
          <p>{problem.body}</p>
          {problem.action === 'switch-account' && (
            <div className="mt-3 space-y-2">
              {user?.email && <p>You are signed in as <span className="font-semibold">{user.email}</span>.</p>}
              <Button variant="secondary" onClick={() => { void logout(); }}>Sign out</Button>
            </div>
          )}
          {problem.action === 'verify-email' && <p className="mt-2">Use “Resend verification email” at the top of this page if you need a new message.</p>}
          {problem.action === 'travel-plan' && <Link href="/travel-plan" className="mt-3 inline-flex min-h-11 items-center font-semibold underline">Go to my travel plan</Link>}
        </Alert>
      )}

      {phase === 'ready' && details && (
        <InvitationDetails details={details} busy={answer.isPending} onAccept={() => { void respond('accept'); }} onDecline={() => { void respond('decline'); }} />
      )}

      {phase === 'accepted' && (
        <Card className="space-y-3">
          <p className="inline-flex items-center gap-2 text-base font-semibold text-brand-700"><CheckCircle2 aria-hidden="true" className="h-5 w-5" /> Your account is linked</p>
          <p className="text-sm text-gray-600">Booking, group and visa status for this trip now appear on your travel plan. You can unlink at any time.</p>
          <Link href="/travel-plan" className="uc-button uc-button-primary">Open my travel plan</Link>
        </Card>
      )}

      {phase === 'declined' && (
        <Alert tone="info" title="Invitation declined">
          <p>Nothing was linked. Your travel organizer can send a new invitation if you change your mind.</p>
          <Link href="/travel-plan" className="mt-3 inline-flex min-h-11 items-center font-semibold underline">Go to my travel plan</Link>
        </Alert>
      )}
    </div>
  );
}

/** What the traveler is agreeing to. Pure: props in, markup out. */
export function InvitationDetails({
  details,
  busy,
  onAccept,
  onDecline,
}: {
  details: InvitationPreview;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <Card className="space-y-4">
      <div>
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand-700"><Link2 aria-hidden="true" className="h-4 w-4" /> From {details.organization.name}</p>
        <h2 className="mt-2 text-lg font-semibold text-gray-900">Follow the trip of {details.traveler.name}</h2>
        <p className="mt-1 text-sm text-gray-600">This invitation expires on {formatDate(details.expiresAt)}.</p>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
        <li>You will see the booking, group and visa status {details.organization.name} holds for this traveler record.</li>
        <li>{details.organization.name} will see that your account accepted: your name and email address.</li>
        <li>Passport, medical, payment and internal details are never shown here.</li>
        <li>You can unlink at any time from your travel plan.</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button busy={busy} onClick={onAccept}>Accept and link my account</Button>
        <Button variant="secondary" disabled={busy} onClick={onDecline}>Decline</Button>
      </div>
    </Card>
  );
}
