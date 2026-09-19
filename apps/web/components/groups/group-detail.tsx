'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowLeft, BookOpen, Bus, Calendar, CheckCircle2, Download, Edit3, EyeOff, FileText, Globe, Hotel, Link2, Lock,
  MessageSquare, Paperclip, Pin, Plus, Save, Send, Settings as SettingsIcon, ShieldAlert, Trash2, UserPlus, Users2, Vote,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, Input, QueryFailure, Select, Textarea } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useCapabilities } from '@/hooks/use-capabilities';
import {
  useAddGroupDocument, useCreateGroupIncident, useCreateGroupInvite, useCreateGroupNote, useDeleteGroup, useDeleteGroupDocument,
  useDeleteGroupNote, useGroup, useGroupDocuments, useGroupIncidents, useGroupInvites, useGroupMembers, useGroupNotes,
  useGroupRelated, useRemoveGroupMember, useResolveGroupIncident, useRevokeGroupInvite, useUpdateGroup, useUpdateGroupNote,
} from '@/hooks/use-groups';
import { CommunityGroupDetail } from './community-group-detail';
import { GroupDiscussion } from './group-discussion';
import { GroupPolls } from './group-polls';
import { GROUP_STATUS, GroupsLoading } from './groups-list';

type TabKey = 'overview' | 'members' | 'discussion' | 'polls' | 'notes' | 'documents' | 'incidents' | 'related' | 'settings';

const TABS: { key: TabKey; label: string; icon: typeof Users2; write?: boolean }[] = [
  { key: 'overview', label: 'Overview', icon: Users2 },
  { key: 'members', label: 'Members', icon: UserPlus },
  { key: 'discussion', label: 'Discussion', icon: MessageSquare },
  { key: 'polls', label: 'Polls', icon: Vote },
  { key: 'notes', label: 'Planning', icon: FileText },
  { key: 'documents', label: 'Documents', icon: Paperclip },
  { key: 'incidents', label: 'Incidents', icon: ShieldAlert },
  { key: 'related', label: 'Related', icon: Link2 },
  { key: 'settings', label: 'Settings', icon: SettingsIcon, write: true },
];

const NOTE_CATEGORIES = ['GENERAL', 'PLANNING', 'ITINERARY', 'CHECKLIST', 'TRANSPORT', 'HOTEL'];
const INCIDENT_TYPES = ['MEDICAL', 'LOST', 'DELAY', 'COMPLAINT', 'OTHER'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * The managing organization's view of a trip group. Reads need crm:pilgrim:read,
 * changes need crm:pilgrim:update and the group must belong to the caller's
 * organization (`viewer.canManage`); the server enforces both. Anyone else —
 * a member, or another organization looking at a public group — gets the
 * members' view.
 */
export function GroupDetail({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useCapabilities();
  const [tab, setTab] = useState<TabKey>('overview');
  const group = useGroup(id);

  if (group.isLoading) return <GroupsLoading />;
  const status = (group.error as any)?.response?.status;
  if (status === 404 || status === 400) {
    return (
      <div className="space-y-4">
        <Link href="/groups" className="inline-flex items-center gap-2 text-sm font-medium text-brand-700">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to groups
        </Link>
        <Alert title="Group not found">It does not exist, or it belongs to another organization.</Alert>
      </div>
    );
  }
  if (group.error || !group.data) return <QueryFailure error={group.error} onRetry={() => group.refetch()} />;

  const g = group.data;
  // The full record (with tenantId) only reaches the managing organization.
  if (!g.tenantId) return <CommunityGroupDetail id={id} />;

  const canUpdate = !!g.viewer?.canManage && can('crm:pilgrim:update');
  const visibility = (g.visibility ?? 'PRIVATE').toUpperCase();
  const VisIcon = visibility === 'PUBLIC' ? Globe : visibility === 'UNLISTED' ? EyeOff : Lock;
  const statusCfg = GROUP_STATUS[g.status] ?? { label: g.status, color: 'bg-gray-100 text-gray-600' };
  const tabs = TABS.filter((t) => !t.write || canUpdate);

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="quiet" aria-label="Back to groups" onClick={() => router.push('/groups')} className="rounded-xl border border-gray-200 p-2 hover:bg-gray-50">
          <ArrowLeft aria-hidden="true" className="h-4 w-4 text-gray-600" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{g.name}</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
              <VisIcon aria-hidden="true" className="h-3 w-3" />
              {visibility === 'PUBLIC' ? 'Public' : visibility === 'UNLISTED' ? 'Unlisted' : 'Private'}
            </span>
            {g.tripType && <span className="rounded-full bg-saudi-50 px-2 py-1 text-xs font-medium text-saudi-700">{g.tripType}</span>}
            <span className={cn('rounded-full px-2 py-1 text-xs font-medium', statusCfg.color)}>{statusCfg.label}</span>
          </div>
          {g.description && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{g.description}</p>}
        </div>
      </div>

      <div role="tablist" aria-label="Group sections" className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5">
        {tabs.map((t) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'border border-brand-100 bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50',
            )}
          >
            <t.icon aria-hidden="true" className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab group={g} />}
      {tab === 'members' && <MembersTab groupId={id} canUpdate={canUpdate} />}
      {tab === 'discussion' && <GroupDiscussion groupId={id} canPost={canUpdate} canPin={canUpdate} />}
      {tab === 'polls' && <GroupPolls groupId={id} canCreate={canUpdate} />}
      {tab === 'notes' && <NotesTab groupId={id} canUpdate={canUpdate} />}
      {tab === 'documents' && <DocumentsTab groupId={id} canUpdate={canUpdate} />}
      {tab === 'incidents' && <IncidentsTab groupId={id} canUpdate={canUpdate} />}
      {tab === 'related' && <RelatedTab groupId={id} />}
      {tab === 'settings' && canUpdate && <SettingsTab group={g} />}
    </div>
  );
}

// ─── Overview ───────────────────────────────────────────────────────────

function OverviewTab({ group }: { group: any }) {
  const stats = [
    { label: 'Members', value: group._count?.members ?? 0, color: 'text-brand-600' },
    { label: 'Posts', value: group._count?.posts ?? 0, color: 'text-blue-600' },
    { label: 'Polls', value: group._count?.polls ?? 0, color: 'text-purple-600' },
    { label: 'Notes', value: group._count?.notes ?? 0, color: 'text-green-800' },
    { label: 'Incidents', value: group._count?.incidents ?? 0, color: 'text-red-600' },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="mt-1 text-xs text-gray-600">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <h3 className="text-sm font-bold text-gray-900">Trip details</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Departure" value={group.departureDate ? new Date(group.departureDate).toLocaleDateString() : '—'} icon={Calendar} />
            <Detail label="Return" value={group.returnDate ? new Date(group.returnDate).toLocaleDateString() : '—'} icon={Calendar} />
            <Detail label="Season" value={group.season ?? '—'} icon={BookOpen} />
            <Detail label="Capacity" value={`${group.enrolledCount ?? 0} / ${group.capacity ?? '—'}`} icon={Users2} />
          </div>
          {group.briefingNotes && (
            <div className="border-t border-gray-50 pt-3">
              <p className="mb-1 text-xs font-semibold text-gray-600">Briefing notes (your organization only)</p>
              <p className="whitespace-pre-wrap text-sm text-gray-700">{group.briefingNotes}</p>
            </div>
          )}
        </div>
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-bold text-gray-900">Recent incidents</h3>
          {group.incidents?.length > 0 ? (
            <ul className="space-y-2">
              {group.incidents.slice(0, 5).map((i: any) => (
                <li key={i.id} className="text-xs text-gray-700">
                  <span className="font-semibold text-red-600">{i.severity}</span> {i.resolvedAt ? '(resolved)' : ''}: {i.description?.slice(0, 80)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-600">No incidents reported.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users2 }) {
  return (
    <div>
      <p className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
        <Icon aria-hidden="true" className="h-3 w-3" /> {label}
      </p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}

// ─── Members & invitations ─────────────────────────────────────────────

const INVITE_STATUS: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-800',
  ACCEPTED: 'bg-green-50 text-green-800',
  DECLINED: 'bg-gray-100 text-gray-600',
  REVOKED: 'bg-gray-100 text-gray-600',
};

function MembersTab({ groupId, canUpdate }: { groupId: string; canUpdate: boolean }) {
  const members = useGroupMembers(groupId);
  const invites = useGroupInvites(groupId);
  const createInvite = useCreateGroupInvite();
  const revokeInvite = useRevokeGroupInvite();
  const removeMember = useRemoveGroupMember();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submitInvite = async () => {
    if (!emailValid) return;
    try {
      const invite = await createInvite.mutateAsync({ groupId, inviteeEmail: email.trim(), message: message.trim() || undefined });
      toast.success(
        invite?.notified
          ? 'Invitation sent — they will see it in Umrah Connect'
          : 'Invitation saved. No account uses this email yet; it will be waiting when they sign up with it. No email is sent.',
      );
      setEmail('');
      setMessage('');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The invitation could not be created.'));
    }
  };

  return (
    <div className="space-y-4">
      {canUpdate && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-1 inline-flex items-center gap-2 text-sm font-bold text-gray-900">
            <UserPlus aria-hidden="true" className="h-4 w-4" /> Invite by email
          </h3>
          <p className="mb-3 text-xs text-gray-600">Invitations are delivered inside Umrah Connect to the account with this email. No email message is sent.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input aria-label="Invitee email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="traveler@email.com" className="flex-1 text-sm" />
            <Input aria-label="Invitation message (optional)" value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} placeholder="Optional message" className="flex-1 text-sm" />
            <Button onClick={submitInvite} busy={createInvite.isPending} disabled={!emailValid}>
              {!createInvite.isPending && <Send aria-hidden="true" className="h-4 w-4" />} Invite
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-900">Members ({members.data?.length ?? 0})</h3>
        </div>
        {members.error ? (
          <div className="p-4">
            <QueryFailure error={members.error} onRetry={() => members.refetch()} />
          </div>
        ) : members.isLoading ? (
          <GroupsLoading />
        ) : !members.data?.length ? (
          <p className="p-6 text-center text-sm text-gray-600">No members yet — invite travelers by email.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {members.data.map((m: any) => {
              const name = m.user ? `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim() : 'Member';
              return (
                <li key={m.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                      {(m.user?.firstName?.[0] ?? 'M').toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{name}</p>
                      <p className="text-xs text-gray-600">{m.user?.email ?? ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">{m.role}</span>
                    {canUpdate && (
                      <Button
                        variant="quiet"
                        aria-label={`Remove ${name} from the group`}
                        busy={removeMember.isPending && removeMember.variables?.userId === m.userId}
                        onClick={async () => {
                          if (!window.confirm(`Remove ${name} from this group?`)) return;
                          try {
                            await removeMember.mutateAsync({ groupId, userId: m.userId });
                            toast.success('Member removed');
                          } catch (error) {
                            toast.error(apiErrorMessage(error, 'The member could not be removed.'));
                          }
                        }}
                        className="rounded p-1.5 text-red-700 hover:bg-red-50"
                      >
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-900">Invitations ({invites.data?.length ?? 0})</h3>
        </div>
        {invites.error ? (
          <div className="p-4">
            <QueryFailure error={invites.error} onRetry={() => invites.refetch()} />
          </div>
        ) : invites.isLoading ? (
          <GroupsLoading />
        ) : !invites.data?.length ? (
          <p className="p-6 text-center text-sm text-gray-600">No invitations sent yet.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {invites.data.map((inv: any) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-900">{inv.inviteeEmail ?? 'Organization member'}</p>
                  <p className="text-xs text-gray-600">
                    Sent {new Date(inv.createdAt).toLocaleDateString()}
                    {inv.respondedAt ? ` · answered ${new Date(inv.respondedAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('rounded-full px-2 py-1 text-xs font-medium', INVITE_STATUS[inv.status] ?? INVITE_STATUS.REVOKED)}>{inv.status.toLowerCase()}</span>
                  {canUpdate && inv.status === 'PENDING' && (
                    <Button
                      variant="secondary"
                      busy={revokeInvite.isPending && revokeInvite.variables?.inviteId === inv.id}
                      onClick={async () => {
                        try {
                          await revokeInvite.mutateAsync({ groupId, inviteId: inv.id });
                          toast.success('Invitation withdrawn');
                        } catch (error) {
                          toast.error(apiErrorMessage(error, 'The invitation could not be withdrawn.'));
                        }
                      }}
                      className="px-3 py-1 text-xs"
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Planning notes ─────────────────────────────────────────────────────

function NotesTab({ groupId, canUpdate }: { groupId: string; canUpdate: boolean }) {
  const notes = useGroupNotes(groupId);
  const createNote = useCreateGroupNote();
  const updateNote = useUpdateGroupNote();
  const deleteNote = useDeleteGroupNote();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('PLANNING');

  const submit = async () => {
    if (!title.trim()) return;
    try {
      await createNote.mutateAsync({ groupId, title: title.trim(), body: body || undefined, category });
      setTitle('');
      setBody('');
      toast.success('Note saved');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The note could not be saved.'));
    }
  };

  return (
    <div className="space-y-4">
      {canUpdate && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-gray-900">
            <FileText aria-hidden="true" className="h-4 w-4" /> New planning note
          </h3>
          <div className="mb-2 grid gap-2 sm:grid-cols-3">
            <Input aria-label="Note title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="text-sm sm:col-span-2" />
            <Select aria-label="Note category" value={category} onChange={(e) => setCategory(e.target.value)} className="text-sm">
              {NOTE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
          <Textarea aria-label="Note details" value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Details…" className="w-full resize-none text-sm" />
          <div className="mt-2 flex justify-end">
            <Button onClick={submit} busy={createNote.isPending} disabled={!title.trim()}>
              {!createNote.isPending && <Plus aria-hidden="true" className="h-4 w-4" />} Save note
            </Button>
          </div>
        </div>
      )}
      {notes.error ? (
        <QueryFailure error={notes.error} onRetry={() => notes.refetch()} />
      ) : notes.isLoading ? (
        <GroupsLoading />
      ) : !notes.data?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-600">No planning notes yet.</div>
      ) : (
        <ul className="space-y-3">
          {notes.data.map((n: any) => (
            <li key={n.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
                    {n.pinned && <Pin aria-label="Pinned" className="h-3.5 w-3.5 text-yellow-800" />}
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    {n.category} • {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
                {canUpdate && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="quiet"
                      aria-label={n.pinned ? 'Unpin note' : 'Pin note'}
                      busy={updateNote.isPending && updateNote.variables?.noteId === n.id}
                      onClick={async () => {
                        try {
                          await updateNote.mutateAsync({ noteId: n.id, pinned: !n.pinned });
                        } catch (error) {
                          toast.error(apiErrorMessage(error, 'The note could not be updated.'));
                        }
                      }}
                      className="rounded p-1.5 hover:bg-gray-100"
                    >
                      <Pin aria-hidden="true" className={cn('h-3.5 w-3.5', n.pinned ? 'text-yellow-800' : 'text-gray-600')} />
                    </Button>
                    <Button
                      variant="quiet"
                      aria-label="Delete note"
                      busy={deleteNote.isPending && deleteNote.variables === n.id}
                      onClick={async () => {
                        if (!window.confirm('Delete this note?')) return;
                        try {
                          await deleteNote.mutateAsync(n.id);
                          toast.success('Note deleted');
                        } catch (error) {
                          toast.error(apiErrorMessage(error, 'The note could not be deleted.'));
                        }
                      }}
                      className="rounded p-1.5 text-red-700 hover:bg-red-50"
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              {n.body && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{n.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Documents (shared links) ───────────────────────────────────────────

function DocumentsTab({ groupId, canUpdate }: { groupId: string; canUpdate: boolean }) {
  const docs = useGroupDocuments(groupId);
  const add = useAddGroupDocument();
  const del = useDeleteGroupDocument();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const urlValid = /^https?:\/\/\S+$/i.test(url.trim());

  const submit = async () => {
    if (!name.trim() || !urlValid) return;
    try {
      await add.mutateAsync({ groupId, name: name.trim(), url: url.trim(), description: description || undefined });
      toast.success('Link added');
      setName('');
      setUrl('');
      setDescription('');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The link could not be added.'));
    }
  };

  return (
    <div className="space-y-4">
      {canUpdate && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-1 inline-flex items-center gap-2 text-sm font-bold text-gray-900">
            <Paperclip aria-hidden="true" className="h-4 w-4" /> Share a document link
          </h3>
          <p className="mb-3 text-xs text-gray-600">Add a link (https://…) to an itinerary or guide stored elsewhere. Files are not uploaded here.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input aria-label="Document name" value={name} maxLength={255} onChange={(e) => setName(e.target.value)} placeholder="Document name" className="text-sm" />
            <Input aria-label="Document link" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="text-sm" />
            <Input aria-label="Description (optional)" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="text-sm sm:col-span-2" />
          </div>
          {url && !urlValid && <p className="mt-2 text-xs text-red-700">Enter a full link starting with https:// or http://</p>}
          <div className="mt-2 flex justify-end">
            <Button onClick={submit} busy={add.isPending} disabled={!name.trim() || !urlValid}>
              {!add.isPending && <Plus aria-hidden="true" className="h-4 w-4" />} Add link
            </Button>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-900">Documents ({docs.data?.length ?? 0})</h3>
        </div>
        {docs.error ? (
          <div className="p-4">
            <QueryFailure error={docs.error} onRetry={() => docs.refetch()} />
          </div>
        ) : docs.isLoading ? (
          <GroupsLoading />
        ) : !docs.data?.length ? (
          <p className="py-10 text-center text-sm text-gray-600">No documents shared yet.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {docs.data.map((d: any) => {
              const safe = /^https?:\/\//i.test(d.url);
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Paperclip aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-500" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{d.name}</p>
                      {d.description && <p className="truncate text-xs text-gray-600">{d.description}</p>}
                      <p className="text-xs text-gray-600">{new Date(d.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {safe && (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${d.name}`} className="rounded p-1.5 text-gray-600 hover:bg-gray-100">
                        <Download aria-hidden="true" className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {canUpdate && (
                      <Button
                        variant="quiet"
                        aria-label={`Delete ${d.name}`}
                        busy={del.isPending && del.variables === d.id}
                        onClick={async () => {
                          if (!window.confirm('Delete this document link?')) return;
                          try {
                            await del.mutateAsync(d.id);
                            toast.success('Link removed');
                          } catch (error) {
                            toast.error(apiErrorMessage(error, 'The link could not be removed.'));
                          }
                        }}
                        className="rounded p-1.5 text-red-700 hover:bg-red-50"
                      >
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Incidents ──────────────────────────────────────────────────────────

function IncidentsTab({ groupId, canUpdate }: { groupId: string; canUpdate: boolean }) {
  const incidents = useGroupIncidents(groupId);
  const create = useCreateGroupIncident();
  const resolve = useResolveGroupIncident();
  const [type, setType] = useState('MEDICAL');
  const [severity, setSeverity] = useState('MEDIUM');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');

  const report = async () => {
    if (!description.trim()) return;
    try {
      await create.mutateAsync({ groupId, type, severity, description: description.trim(), location: location.trim() || undefined });
      setDescription('');
      setLocation('');
      toast.success('Incident reported');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The incident could not be reported.'));
    }
  };

  return (
    <div className="space-y-4">
      {canUpdate && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-gray-900">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 text-red-600" /> Report an incident
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select aria-label="Incident type" value={type} onChange={(e) => setType(e.target.value)} className="text-sm">
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
            <Select aria-label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)} className="text-sm">
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
            <Input aria-label="Location (optional)" value={location} maxLength={500} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className="text-sm" />
          </div>
          <Textarea aria-label="What happened" value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What happened?" className="mt-2 w-full resize-none text-sm" />
          <div className="mt-2 flex justify-end">
            <Button variant="danger" onClick={report} busy={create.isPending} disabled={!description.trim()}>
              Report incident
            </Button>
          </div>
        </div>
      )}
      {incidents.error ? (
        <QueryFailure error={incidents.error} onRetry={() => incidents.refetch()} />
      ) : incidents.isLoading ? (
        <GroupsLoading />
      ) : !incidents.data?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-600">No incidents reported for this group.</div>
      ) : (
        <ul className="space-y-3">
          {incidents.data.map((i: any) => (
            <li key={i.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {i.type} · <span className="text-red-700">{i.severity}</span>
                  </p>
                  <p className="text-xs text-gray-600">
                    {new Date(i.createdAt).toLocaleString()}
                    {i.location ? ` · ${i.location}` : ''}
                  </p>
                </div>
                {i.resolvedAt ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-800">
                    <CheckCircle2 aria-hidden="true" className="h-3 w-3" /> Resolved {new Date(i.resolvedAt).toLocaleDateString()}
                  </span>
                ) : (
                  canUpdate && resolving !== i.id && (
                    <Button variant="secondary" onClick={() => { setResolving(i.id); setResolution(''); }} className="px-3 py-1 text-xs">
                      Mark resolved
                    </Button>
                  )
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{i.description}</p>
              {i.resolution && <p className="mt-2 text-xs text-gray-600">Resolution: {i.resolution}</p>}
              {resolving === i.id && (
                <div className="mt-3 space-y-2">
                  <Textarea aria-label="How was it resolved?" value={resolution} maxLength={5000} onChange={(e) => setResolution(e.target.value)} rows={2} placeholder="How was it resolved?" className="w-full resize-none text-sm" />
                  <div className="flex gap-2">
                    <Button
                      busy={resolve.isPending}
                      disabled={!resolution.trim()}
                      onClick={async () => {
                        try {
                          await resolve.mutateAsync({ groupId, incidentId: i.id, resolution: resolution.trim() });
                          setResolving(null);
                          toast.success('Incident marked resolved');
                        } catch (error) {
                          toast.error(apiErrorMessage(error, 'The incident could not be updated.'));
                        }
                      }}
                      className="px-3 py-1.5 text-xs"
                    >
                      Save resolution
                    </Button>
                    <Button variant="secondary" disabled={resolve.isPending} onClick={() => setResolving(null)} className="px-3 py-1.5 text-xs">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Related records ────────────────────────────────────────────────────

function RelatedTab({ groupId }: { groupId: string }) {
  const related = useGroupRelated(groupId);
  if (related.error) return <QueryFailure error={related.error} onRetry={() => related.refetch()} />;
  if (related.isLoading) return <GroupsLoading />;
  const bookings = related.data?.bookings ?? [];
  const assignments = related.data?.transportAssignments ?? [];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h3 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
            <Hotel aria-hidden="true" className="h-4 w-4" /> Linked bookings ({bookings.length})
          </h3>
        </div>
        {bookings.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-600">No bookings linked to this group yet.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {bookings.map((b: any) => (
              <li key={b.id} className="p-4">
                <Link href="/bookings" className="block">
                  <p className="text-sm font-semibold text-gray-900">{b.bookingRef ?? b.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-600">
                    {b.package?.name ?? '—'} · {b.status}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h3 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
            <Bus aria-hidden="true" className="h-4 w-4" /> Transport assignments ({assignments.length})
          </h3>
        </div>
        {assignments.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-600">No transport assignments linked to this group yet.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {assignments.map((a: any) => (
              <li key={a.id} className="p-4">
                <Link href="/transport" className="block">
                  <p className="text-sm font-semibold text-gray-900">{a.route?.name ?? '—'}</p>
                  <p className="text-xs text-gray-600">
                    {a.vehicle?.plateNumber ?? '—'} · {new Date(a.scheduledAt).toLocaleDateString()} · {a.status}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Settings ───────────────────────────────────────────────────────────

function SettingsTab({ group }: { group: any }) {
  const router = useRouter();
  const update = useUpdateGroup();
  const remove = useDeleteGroup();
  const [name, setName] = useState(group.name ?? '');
  const [description, setDescription] = useState(group.description ?? '');
  const [visibility, setVisibility] = useState(group.visibility ?? 'PRIVATE');
  const [status, setStatus] = useState(group.status ?? 'PLANNING');
  const [capacity, setCapacity] = useState<string>(String(group.capacity ?? 40));
  const [briefingNotes, setBriefingNotes] = useState(group.briefingNotes ?? '');
  const [departureDate, setDepartureDate] = useState(group.departureDate?.slice(0, 10) ?? '');
  const [returnDate, setReturnDate] = useState(group.returnDate?.slice(0, 10) ?? '');
  const cap = Number(capacity);
  const invalid = !name.trim() || !Number.isInteger(cap) || cap < 1 || (!!departureDate && !!returnDate && returnDate < departureDate);

  const submit = async () => {
    if (invalid) return;
    try {
      await update.mutateAsync({
        id: group.id,
        name: name.trim(),
        description,
        visibility,
        status,
        capacity: cap,
        briefingNotes,
        departureDate: departureDate || undefined,
        returnDate: returnDate || undefined,
      });
      toast.success('Group saved');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The group could not be saved.'));
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this group permanently? Members, posts, polls, notes and document links will be removed.')) return;
    try {
      await remove.mutateAsync(group.id);
      toast.success('Group deleted');
      router.push('/groups');
    } catch (e) {
      // e.g. 409: the group has incident reports or linked bookings — close it instead.
      toast.error(apiErrorMessage(e, 'The group could not be deleted.'));
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
          <Edit3 aria-hidden="true" className="h-4 w-4" /> Group settings
        </h3>
        <Field label="Name">
          <Input aria-label="Name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} className="w-full text-sm" />
        </Field>
        <Field label="Description">
          <Textarea aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full resize-none text-sm" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Visibility">
            <Select aria-label="Visibility" value={visibility} onChange={(e) => setVisibility(e.target.value)} className="w-full text-sm">
              <option value="PRIVATE">Private — invited members only</option>
              <option value="UNLISTED">Unlisted — anyone with the link can join</option>
              <option value="PUBLIC">Public — listed and open to join</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full text-sm">
              {Object.entries(GROUP_STATUS).map(([value, cfg]) => (
                <option key={value} value={value}>
                  {cfg.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Capacity">
            <Input aria-label="Capacity" type="number" min="1" step="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-full text-sm" />
          </Field>
          <Field label="Departure">
            <Input aria-label="Departure date" type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} className="w-full text-sm" />
          </Field>
          <Field label="Return">
            <Input aria-label="Return date" type="date" value={returnDate} min={departureDate || undefined} onChange={(e) => setReturnDate(e.target.value)} className="w-full text-sm" />
          </Field>
        </div>
        <Field label="Briefing notes (your organization only)">
          <Textarea aria-label="Briefing notes" value={briefingNotes} onChange={(e) => setBriefingNotes(e.target.value)} rows={3} className="w-full resize-none text-sm" />
        </Field>
        <div className="flex justify-end pt-2">
          <Button onClick={submit} busy={update.isPending} disabled={invalid}>
            {!update.isPending && <Save aria-hidden="true" className="h-4 w-4" />} Save changes
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-red-100 bg-white p-5">
        <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-red-700">
          <AlertTriangle aria-hidden="true" className="h-4 w-4" /> Delete group
        </h3>
        <p className="mb-3 text-xs text-gray-600">
          Removes the group with its members, discussion, polls, notes and document links. Groups with incident reports, linked bookings or transport
          assignments cannot be deleted — set their status to Completed or Cancelled instead.
        </p>
        <Button variant="danger" onClick={handleDelete} busy={remove.isPending}>
          Delete group
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  );
}
