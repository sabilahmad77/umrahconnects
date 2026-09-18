'use client';

import { useState } from 'react';
import { Link2, History, Mail, RotateCw, ShieldOff, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, Dialog, Input, LoadingState, QueryFailure, Textarea } from '@/components/ui/system';
import { useCapabilities } from '@/hooks/use-capabilities';
import { apiErrorMessage } from '@/lib/api-error';
import {
  useInviteTraveler,
  usePilgrimAccountLinks,
  useResendInvitation,
  useRevokeAccountLink,
  type OrganizationAccountLink,
} from '@/hooks/use-traveler-links';
import { currentAccountLink, formatDate, linkStatusMeta } from '@/components/travelers/link-presentation';

/**
 * "Traveler account access" for one pilgrim record (P06, D-022): invite the
 * traveler to follow their own trip status, resend, revoke, and see the history.
 * The server decides everything; controls only appear for staff who hold
 * `crm:pilgrim:update`, and every refusal is shown as returned.
 */
export function PilgrimAccountAccess({ pilgrim }: { pilgrim: { id: string; email?: string | null } }) {
  const { ready, can } = useCapabilities();
  const canManage = ready && can('crm:pilgrim:update');
  const { data: links, isLoading, error, refetch } = usePilgrimAccountLinks(pilgrim.id);
  const invite = useInviteTraveler(pilgrim.id);
  const resend = useResendInvitation(pilgrim.id);
  const revoke = useRevokeAccountLink(pilgrim.id);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<OrganizationAccountLink | null>(null);
  const [reason, setReason] = useState('');

  if (error) return <QueryFailure error={error} onRetry={() => { void refetch(); }} />;
  if (isLoading || !links) return <Card><LoadingState label="Loading traveler access…" /></Card>;

  const current = currentAccountLink(links);

  const openInvite = () => {
    setEmail(pilgrim.email ?? '');
    setInviteOpen(true);
  };
  const sendInvite = async () => {
    const typed = email.trim();
    try {
      const sent = await invite.mutateAsync(typed && typed.toLowerCase() !== (pilgrim.email ?? '').trim().toLowerCase() ? { email: typed } : {});
      toast.success(`Invitation sent to ${sent.invitedEmail}`);
      setInviteOpen(false);
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The invitation could not be sent.'));
    }
  };
  const resendInvite = async (link: OrganizationAccountLink) => {
    try {
      const sent = await resend.mutateAsync(link.id);
      toast.success(`A new invitation link was sent to ${sent.invitedEmail}. The previous link no longer works.`);
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The invitation could not be resent.'));
    }
  };
  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revoke.mutateAsync({ linkId: revokeTarget.id, reason: reason.trim() });
      toast.success(revokeTarget.status === 'ACTIVE' ? 'Access revoked. The traveler can no longer see this trip.' : 'Invitation withdrawn.');
      setRevokeTarget(null);
      setReason('');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Access could not be revoked.'));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h3 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900"><Link2 aria-hidden="true" className="h-4 w-4" /> Traveler account access</h3>
          <p className="mt-1 text-sm text-gray-600">
            Invite this traveler to follow their booking, group and visa status from their own Umrah Connect account.
            Only the account that has verified the invited email address can accept. Travelers never see passport,
            medical, payment or internal details, and you can revoke access at any time.
          </p>
        </div>
        <AccountAccessStatus
          link={current}
          canManage={canManage}
          busy={invite.isPending || resend.isPending || revoke.isPending}
          onInvite={openInvite}
          onResend={resendInvite}
          onRevoke={(link) => { setReason(''); setRevokeTarget(link); }}
        />
      </Card>

      <Card className="space-y-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900"><History aria-hidden="true" className="h-4 w-4" /> Access history</h3>
        <AccountAccessHistory links={links} />
      </Card>

      <Dialog open={inviteOpen} onOpenChange={(open) => { if (!invite.isPending) setInviteOpen(open); }} title="Invite traveler" description="The invitation link works once and expires after 7 days.">
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void sendInvite(); }}>
          <div>
            <label htmlFor="traveler-invite-email" className="mb-2 block text-sm font-medium text-gray-700">Email address</label>
            <Input id="traveler-invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
            <p className="mt-2 text-xs text-gray-600">
              {pilgrim.email ? 'Prefilled with the email on this record. A different address is recorded on the invitation as entered by you.' : 'This record has no email on file. The address you enter is recorded on the invitation.'}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={invite.isPending} onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button type="submit" busy={invite.isPending} disabled={!email.trim()}>Send invitation</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={!!revokeTarget}
        onOpenChange={(open) => { if (!open && !revoke.isPending) setRevokeTarget(null); }}
        title={revokeTarget?.status === 'ACTIVE' ? 'Revoke traveler access' : 'Withdraw invitation'}
        description={revokeTarget?.status === 'ACTIVE' ? 'The traveler stops seeing this trip immediately.' : 'The invitation link stops working immediately.'}
      >
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void confirmRevoke(); }}>
          <div>
            <label htmlFor="traveler-revoke-reason" className="mb-2 block text-sm font-medium text-gray-700">Reason</label>
            <Textarea id="traveler-revoke-reason" required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: booking transferred to another traveler" />
            <p className="mt-2 text-xs text-gray-600">Kept on the access history and in the audit log.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={revoke.isPending} onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button type="submit" variant="danger" busy={revoke.isPending} disabled={reason.trim().length < 3}>
              {revokeTarget?.status === 'ACTIVE' ? 'Revoke access' : 'Withdraw invitation'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

/** The current state of access, with the actions that fit it. Pure: props in, markup out. */
export function AccountAccessStatus({
  link,
  canManage,
  busy,
  onInvite,
  onResend,
  onRevoke,
}: {
  link: OrganizationAccountLink | null;
  canManage: boolean;
  busy?: boolean;
  onInvite: () => void;
  onResend: (link: OrganizationAccountLink) => void;
  onRevoke: (link: OrganizationAccountLink) => void;
}) {
  if (!link) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">Not linked to a traveler account</p>
          <p className="text-sm text-gray-600">The traveler cannot see this trip in Umrah Connect until they accept an invitation.</p>
        </div>
        {canManage && <Button onClick={onInvite} disabled={busy}><Mail aria-hidden="true" className="h-4 w-4" /> Invite traveler</Button>}
      </div>
    );
  }
  if (link.status === 'ACTIVE') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900"><UserCheck aria-hidden="true" className="h-4 w-4 text-brand-600" /> Linked to {link.account?.name ?? 'a traveler account'}</p>
          <p className="text-sm text-gray-600">{link.account?.email ?? link.invitedEmail} · since {formatDate(link.acceptedAt)}</p>
        </div>
        {canManage && <Button variant="danger" onClick={() => onRevoke(link)} disabled={busy}><ShieldOff aria-hidden="true" className="h-4 w-4" /> Revoke access</Button>}
      </div>
    );
  }
  // INVITED (open) — expired invitations are listed in the history and can be reopened from there.
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">Invitation waiting for the traveler</p>
        <p className="text-sm text-gray-600">Sent to {link.invitedEmail} · expires {formatDate(link.expiresAt)} · sent {link.sendCount} {link.sendCount === 1 ? 'time' : 'times'}</p>
      </div>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onResend(link)} disabled={busy}><RotateCw aria-hidden="true" className="h-4 w-4" /> Resend</Button>
          <Button variant="danger" onClick={() => onRevoke(link)} disabled={busy}>Withdraw</Button>
        </div>
      )}
    </div>
  );
}

/** Every invitation and link for the record, newest first. Pure. */
export function AccountAccessHistory({ links }: { links: OrganizationAccountLink[] }) {
  if (!links.length) return <p className="text-sm text-gray-600">No invitations have been sent for this record.</p>;
  return (
    <ul className="divide-y divide-gray-100">
      {links.map((link) => {
        const meta = linkStatusMeta(link.status);
        return (
          <li key={link.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 space-y-0.5 text-sm">
              <p className="font-medium text-gray-900 break-words">{link.invitedEmail}{link.emailSource === 'ENTERED' && <span className="text-xs font-normal text-gray-600"> · entered by staff</span>}</p>
              <p className="text-xs text-gray-600">Invited {formatDate(link.invitedAt)}{link.invitedBy ? ` by ${link.invitedBy.name}` : ''}{link.sendCount > 1 ? ` · sent ${link.sendCount} times` : ''}</p>
              {link.acceptedAt && <p className="text-xs text-gray-600">Accepted {formatDate(link.acceptedAt)}{link.account ? ` by ${link.account.name}` : ''}</p>}
              {link.declinedAt && <p className="text-xs text-gray-600">Declined {formatDate(link.declinedAt)}</p>}
              {link.unlinkedAt && <p className="text-xs text-gray-600">Unlinked by the traveler {formatDate(link.unlinkedAt)}</p>}
              {link.revokedAt && <p className="text-xs text-gray-600">Revoked {formatDate(link.revokedAt)}{link.revokedBy ? ` by ${link.revokedBy.name}` : ''}{link.revokedReason ? ` — “${link.revokedReason}”` : ''}</p>}
              {link.status === 'EXPIRED' && <p className="text-xs text-gray-600">Expired {formatDate(link.expiresAt)} without an answer</p>}
            </div>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

