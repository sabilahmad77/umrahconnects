'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Users2, MessageSquare, Vote, FileText, Settings as SettingsIcon,
  Loader2, AlertCircle, Globe, Lock, EyeOff, Calendar, Send, Trash2, Plus,
  Pin, Save, X, Edit3, UserPlus, AlertTriangle, BookOpen, MapPin, Phone,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useGroup, useUpdateGroup, useDeleteGroup,
  useGroupMembers, useRemoveGroupMember, useCreateGroupInvite,
  useGroupPosts, useCreateGroupPost, useDeleteGroupPost,
  useGroupPostComments, useCreateGroupPostComment,
  useGroupPolls, useCreateGroupPoll, useVoteGroupPoll,
  useGroupNotes, useCreateGroupNote, useUpdateGroupNote, useDeleteGroupNote,
  useGroupDocuments, useAddGroupDocument, useDeleteGroupDocument,
  useGroupRelated,
} from '@/hooks/use-groups';
import { Paperclip, Link2, Download, Hotel, Bus } from 'lucide-react';

type TabKey = 'overview' | 'members' | 'discussion' | 'polls' | 'notes' | 'documents' | 'related' | 'settings';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'overview',   label: 'Overview',   icon: Users2 },
  { key: 'members',    label: 'Members',    icon: UserPlus },
  { key: 'discussion', label: 'Discussion', icon: MessageSquare },
  { key: 'polls',      label: 'Polls',      icon: Vote },
  { key: 'notes',      label: 'Planning',   icon: FileText },
  { key: 'documents',  label: 'Documents',  icon: Paperclip },
  { key: 'related',    label: 'Related',    icon: Link2 },
  { key: 'settings',   label: 'Settings',   icon: SettingsIcon },
];

export function GroupDetail({ id }: { id: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('overview');
  const { data: group, isLoading, error, refetch } = useGroup(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading group…
      </div>
    );
  }
  if (error || !group) {
    return (
      <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
        <p className="text-sm text-red-500">Group not found</p>
        <Link href="/groups" className="text-xs text-brand-500 hover:underline mt-3 inline-block">← Back to groups</Link>
      </div>
    );
  }

  const visibility = (group.visibility ?? 'PRIVATE').toUpperCase();
  const VisIcon = visibility === 'PUBLIC' ? Globe : visibility === 'UNLISTED' ? EyeOff : Lock;

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/groups')}
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{group.name}</h1>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
              <VisIcon className="h-3 w-3" />
              {visibility === 'PUBLIC' ? 'Public' : visibility === 'UNLISTED' ? 'Unlisted' : 'Private'}
            </span>
            {group.tripType && (
              <span className="text-[11px] font-medium text-saudi-700 bg-saudi-50 px-2 py-1 rounded-full">
                {group.tripType}
              </span>
            )}
            <span className="text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-full">
              {group.status}
            </span>
          </div>
          {group.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{group.description}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors shrink-0',
                tab === t.key
                  ? 'bg-brand-50 text-brand-700 border border-brand-100'
                  : 'text-gray-500 hover:bg-gray-50',
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      {tab === 'overview' && <OverviewTab group={group} refetch={refetch} />}
      {tab === 'members' && <MembersTab groupId={id} />}
      {tab === 'discussion' && <DiscussionTab groupId={id} />}
      {tab === 'polls' && <PollsTab groupId={id} />}
      {tab === 'notes' && <NotesTab groupId={id} />}
      {tab === 'documents' && <DocumentsTab groupId={id} />}
      {tab === 'related' && <RelatedTab groupId={id} />}
      {tab === 'settings' && <SettingsTab group={group} refetch={refetch} />}
    </div>
  );
}

function DocumentsTab({ groupId }: { groupId: string }) {
  const { data: docs = [], refetch } = useGroupDocuments(groupId);
  const add = useAddGroupDocument();
  const del = useDeleteGroupDocument();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
          <Paperclip className="h-4 w-4" /> Share a document
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Document name" className="text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Public URL" className="text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="text-sm px-3 py-2.5 border border-gray-200 rounded-lg col-span-2" />
        </div>
        <div className="mt-2 flex justify-end">
          <button
            onClick={async () => {
              if (!name.trim() || !url.trim()) { toast.error('Name and URL required'); return; }
              try {
                await add.mutateAsync({ groupId, name: name.trim(), url: url.trim(), description: description || undefined });
                toast.success('Document added');
                setName(''); setUrl(''); setDescription('');
                refetch();
              } catch (e: any) {
                toast.error(e?.response?.data?.error?.message ?? 'Failed');
              }
            }}
            disabled={add.isPending || !name.trim() || !url.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add document
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">Documents ({docs.length})</h3>
        </div>
        {docs.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No documents yet</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {docs.map((d: any) => (
              <li key={d.id} className="p-4 flex items-center justify-between gap-3">
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 min-w-0 hover:text-brand-600">
                  <Paperclip className="h-4 w-4 text-brand-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{d.name}</p>
                    {d.description && <p className="text-[11px] text-gray-500 truncate">{d.description}</p>}
                    <p className="text-[11px] text-gray-400">{new Date(d.createdAt).toLocaleString()}</p>
                  </div>
                </a>
                <div className="flex items-center gap-1">
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><Download className="h-3.5 w-3.5" /></a>
                  <button
                    onClick={async () => {
                      if (!confirm('Delete this document?')) return;
                      await del.mutateAsync(d.id);
                      refetch();
                    }}
                    className="p-1.5 rounded hover:bg-red-50 text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RelatedTab({ groupId }: { groupId: string }) {
  const { data, isLoading } = useGroupRelated(groupId);
  if (isLoading) {
    return <div className="flex items-center justify-center py-10 text-sm text-gray-400"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>;
  }
  const bookings = data?.bookings ?? [];
  const assignments = data?.transportAssignments ?? [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Hotel className="h-4 w-4" /> Linked bookings ({bookings.length})</h3>
        </div>
        {bookings.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">No bookings linked to this group yet</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {bookings.map((b: any) => (
              <li key={b.id} className="p-4">
                <Link href={`/bookings`} className="block">
                  <p className="text-sm font-semibold text-gray-900">{b.bookingRef ?? b.id.slice(0, 8)}</p>
                  <p className="text-[11px] text-gray-500">{b.package?.name ?? '—'} · {b.status}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Bus className="h-4 w-4" /> Transport assignments ({assignments.length})</h3>
        </div>
        {assignments.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">No transport assignments linked to this group yet</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {assignments.map((a: any) => (
              <li key={a.id} className="p-4">
                <Link href={`/transport/assignments`} className="block">
                  <p className="text-sm font-semibold text-gray-900">{a.route?.name ?? '—'}</p>
                  <p className="text-[11px] text-gray-500">{a.vehicle?.plateNumber ?? '—'} · {new Date(a.scheduledAt).toLocaleDateString()} · {a.status}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────

function OverviewTab({ group, refetch }: { group: any; refetch: () => void }) {
  const stats = [
    { label: 'Members', value: group._count?.members ?? group.enrolledCount ?? 0, color: 'text-brand-600' },
    { label: 'Posts', value: group._count?.posts ?? 0, color: 'text-blue-600' },
    { label: 'Polls', value: group._count?.polls ?? 0, color: 'text-purple-600' },
    { label: 'Notes', value: group._count?.notes ?? 0, color: 'text-green-600' },
    { label: 'Incidents', value: group._count?.incidents ?? 0, color: 'text-red-600' },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2 space-y-3">
          <h3 className="text-sm font-bold text-gray-900">Trip details</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Departure" value={group.departureDate ? new Date(group.departureDate).toLocaleDateString() : '—'} icon={Calendar} />
            <Detail label="Return" value={group.returnDate ? new Date(group.returnDate).toLocaleDateString() : '—'} icon={Calendar} />
            <Detail label="Season" value={group.season ?? '—'} icon={BookOpen} />
            <Detail label="Capacity" value={`${group.enrolledCount ?? 0} / ${group.capacity ?? '—'}`} icon={Users2} />
          </div>
          {group.briefingNotes && (
            <div className="pt-3 border-t border-gray-50">
              <p className="text-xs font-semibold text-gray-600 mb-1">Briefing notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{group.briefingNotes}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h3 className="text-sm font-bold text-gray-900">Recent incidents</h3>
          {group.incidents && group.incidents.length > 0 ? (
            <ul className="space-y-2">
              {group.incidents.slice(0, 5).map((i: any) => (
                <li key={i.id} className="text-xs text-gray-700">
                  <span className="font-semibold text-red-600">{i.severity}</span>: {i.description?.slice(0, 80)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">No incidents reported.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-500 mb-1 inline-flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}

function MembersTab({ groupId }: { groupId: string }) {
  const { data: members = [], refetch } = useGroupMembers(groupId);
  const createInvite = useCreateGroupInvite();
  const removeMember = useRemoveGroupMember();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const submitInvite = async () => {
    if (!email.trim()) return;
    try {
      await createInvite.mutateAsync({ groupId, inviteeEmail: email.trim(), message: message || undefined });
      toast.success('Invite created');
      setEmail(''); setMessage('');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to invite');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Invite by email
        </h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@email.com"
            className="flex-1 text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400"
          />
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional message"
            className="flex-1 text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400"
          />
          <button
            onClick={submitInvite}
            disabled={createInvite.isPending || !email.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {createInvite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Invite
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">Members ({members.length})</h3>
        </div>
        <ul className="divide-y divide-gray-50">
          {members.length === 0 ? (
            <li className="p-6 text-center text-sm text-gray-400">No members yet</li>
          ) : (
            members.map((m: any) => (
              <li key={m.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-700 font-semibold text-sm">
                    {(m.user?.firstName?.[0] ?? m.userId.slice(0, 2)).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {m.user ? `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim() : m.userId.slice(0, 8)}
                    </p>
                    <p className="text-[11px] text-gray-500">{m.user?.email ?? ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-700">{m.role}</span>
                  <button
                    onClick={async () => {
                      if (!confirm('Remove this member?')) return;
                      await removeMember.mutateAsync({ groupId, userId: m.userId });
                      toast.success('Removed');
                      refetch();
                    }}
                    className="p-1.5 rounded hover:bg-red-50 text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function DiscussionTab({ groupId }: { groupId: string }) {
  const { data: posts = [], refetch } = useGroupPosts(groupId);
  const createPost = useCreateGroupPost();
  const deletePost = useDeleteGroupPost();
  const [body, setBody] = useState('');

  const submit = async () => {
    if (!body.trim()) return;
    try {
      await createPost.mutateAsync({ groupId, body: body.trim() });
      setBody('');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to post');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Share an update with the group…"
          className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400 resize-none"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={submit}
            disabled={createPost.isPending || !body.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {createPost.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Post
          </button>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400 bg-white rounded-2xl border border-gray-100">No posts yet — be the first to share an update.</div>
      ) : (
        <ul className="space-y-3">
          {posts.map((p: any) => (
            <li key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {p.author ? `${p.author.firstName ?? ''} ${p.author.lastName ?? ''}`.trim() : 'Member'}
                  </p>
                  <p className="text-[11px] text-gray-400">{new Date(p.createdAt).toLocaleString()}</p>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm('Delete this post?')) return;
                    await deletePost.mutateAsync({ groupId, postId: p.id });
                    refetch();
                  }}
                  className="p-1.5 rounded hover:bg-red-50 text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{p.body}</p>
              <CommentsThread postId={p.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentsThread({ postId }: { postId: string }) {
  const [show, setShow] = useState(false);
  const [body, setBody] = useState('');
  const { data: comments = [], refetch } = useGroupPostComments(show ? postId : undefined);
  const createComment = useCreateGroupPostComment();

  return (
    <div className="mt-3 pt-3 border-t border-gray-50">
      <button onClick={() => setShow((v) => !v)} className="text-xs font-medium text-brand-500 hover:underline">
        {show ? 'Hide' : 'Show'} comments
      </button>
      {show && (
        <div className="mt-2 space-y-2">
          <ul className="space-y-2">
            {comments.map((c: any) => (
              <li key={c.id} className="text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                <p className="font-semibold text-gray-800 mb-0.5">
                  {c.author ? `${c.author.firstName ?? ''} ${c.author.lastName ?? ''}`.trim() : 'Member'}
                </p>
                <p>{c.body}</p>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Reply…"
              className="flex-1 text-xs px-2.5 py-2 border border-gray-200 rounded-lg outline-none"
            />
            <button
              onClick={async () => {
                if (!body.trim()) return;
                await createComment.mutateAsync({ postId, body: body.trim() });
                setBody('');
                refetch();
              }}
              className="text-xs px-3 py-2 bg-brand-500 text-white rounded-lg disabled:opacity-50"
              disabled={createComment.isPending || !body.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PollsTab({ groupId }: { groupId: string }) {
  const { data: polls = [], refetch } = useGroupPolls(groupId);
  const createPoll = useCreateGroupPoll();
  const vote = useVoteGroupPoll();
  const [question, setQuestion] = useState('');
  const [optionsText, setOptionsText] = useState('');

  const submit = async () => {
    const options = optionsText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!question.trim() || options.length < 2) {
      toast.error('Need a question + at least 2 options');
      return;
    }
    try {
      await createPoll.mutateAsync({ groupId, question: question.trim(), options });
      setQuestion(''); setOptionsText('');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to create poll');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Create a poll</h3>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What time should we leave the hotel?"
          className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400 mb-2"
        />
        <textarea
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          rows={3}
          placeholder="Options, one per line"
          className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400 resize-none"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={submit}
            disabled={createPoll.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {createPoll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create poll
          </button>
        </div>
      </div>

      {polls.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400 bg-white rounded-2xl border border-gray-100">No polls yet</div>
      ) : (
        <ul className="space-y-3">
          {polls.map((p: any) => {
            const total = p.voteCount ?? 0;
            return (
              <li key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <p className="text-sm font-semibold text-gray-900 mb-2">{p.question}</p>
                <p className="text-[11px] text-gray-400 mb-3">{total} vote{total === 1 ? '' : 's'} • {p.status}</p>
                <ul className="space-y-2">
                  {(p.breakdown ?? p.options).map((opt: any) => {
                    const pct = total > 0 ? Math.round((opt.count / total) * 100) : 0;
                    return (
                      <li key={opt.index} className="">
                        <button
                          onClick={async () => {
                            if (p.status === 'CLOSED') return;
                            await vote.mutateAsync({ groupId, pollId: p.id, optionIndices: [opt.index] });
                          }}
                          disabled={p.status === 'CLOSED'}
                          className="w-full text-left rounded-lg border border-gray-200 px-3 py-2 hover:border-brand-300 transition-colors relative overflow-hidden disabled:opacity-50"
                        >
                          <div
                            className="absolute inset-y-0 left-0 bg-brand-50"
                            style={{ width: `${pct}%` }}
                          />
                          <div className="relative flex items-center justify-between text-sm">
                            <span>{opt.label}</span>
                            <span className="text-xs font-semibold text-gray-700">{opt.count ?? 0} ({pct}%)</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const NOTE_CATEGORIES = ['GENERAL', 'PLANNING', 'ITINERARY', 'CHECKLIST', 'TRANSPORT', 'HOTEL'];

function NotesTab({ groupId }: { groupId: string }) {
  const { data: notes = [], refetch } = useGroupNotes(groupId);
  const createNote = useCreateGroupNote();
  const updateNote = useUpdateGroupNote();
  const deleteNote = useDeleteGroupNote();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('PLANNING');

  const submit = async () => {
    if (!title.trim()) return;
    try {
      await createNote.mutateAsync({ groupId, title: title.trim(), body, category });
      setTitle(''); setBody('');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
          <FileText className="h-4 w-4" /> New planning note
        </h3>
        <div className="grid sm:grid-cols-3 gap-2 mb-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="sm:col-span-2 text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white"
          >
            {NOTE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Details…"
          className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400 resize-none"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={submit}
            disabled={createNote.isPending || !title.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {createNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save note
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400 bg-white rounded-2xl border border-gray-100">No notes yet</div>
      ) : (
        <ul className="space-y-3">
          {notes.map((n: any) => (
            <li key={n.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
                    {n.pinned && <Pin className="h-3.5 w-3.5 text-yellow-500" />}
                    {n.title}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{n.category} • {new Date(n.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={async () => {
                      await updateNote.mutateAsync({ noteId: n.id, pinned: !n.pinned });
                      refetch();
                    }}
                    className="p-1.5 rounded hover:bg-gray-100"
                    title="Toggle pin"
                  >
                    <Pin className={cn('h-3.5 w-3.5', n.pinned ? 'text-yellow-500' : 'text-gray-400')} />
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('Delete this note?')) return;
                      await deleteNote.mutateAsync(n.id);
                      refetch();
                    }}
                    className="p-1.5 rounded hover:bg-red-50 text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {n.body && <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{n.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingsTab({ group, refetch }: { group: any; refetch: () => void }) {
  const router = useRouter();
  const update = useUpdateGroup();
  const remove = useDeleteGroup();
  const [name, setName] = useState(group.name ?? '');
  const [description, setDescription] = useState(group.description ?? '');
  const [visibility, setVisibility] = useState(group.visibility ?? 'PRIVATE');
  const [status, setStatus] = useState(group.status ?? 'PLANNING');
  const [capacity, setCapacity] = useState<string>(String(group.capacity ?? 50));
  const [briefingNotes, setBriefingNotes] = useState(group.briefingNotes ?? '');
  const [departureDate, setDepartureDate] = useState(group.departureDate?.slice(0, 10) ?? '');
  const [returnDate, setReturnDate] = useState(group.returnDate?.slice(0, 10) ?? '');

  const submit = async () => {
    try {
      await update.mutateAsync({
        id: group.id,
        name,
        description,
        visibility,
        status,
        capacity: Number(capacity),
        briefingNotes,
        departureDate: departureDate || undefined,
        returnDate: returnDate || undefined,
      });
      toast.success('Group saved');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to save');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this group permanently? All members, posts, notes and polls will be removed.')) return;
    try {
      await remove.mutateAsync(group.id);
      toast.success('Group deleted');
      router.push('/groups');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to delete');
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <Edit3 className="h-4 w-4" /> Group settings
        </h3>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400 resize-none" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Visibility">
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              <option value="PRIVATE">Private</option>
              <option value="UNLISTED">Unlisted</option>
              <option value="PUBLIC">Public</option>
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {['PLANNING', 'ACTIVE', 'IN_KSA', 'RETURNING', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Capacity">
            <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          </Field>
          <Field label="Departure">
            <input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          </Field>
          <Field label="Return">
            <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          </Field>
        </div>
        <Field label="Briefing notes (private to operator)">
          <textarea value={briefingNotes} onChange={(e) => setBriefingNotes(e.target.value)} rows={3} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg resize-none" />
        </Field>
        <div className="flex justify-end pt-2">
          <button
            onClick={submit}
            disabled={update.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-red-100 p-5">
        <h3 className="text-sm font-bold text-red-700 mb-2 inline-flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Danger zone
        </h3>
        <p className="text-xs text-gray-500 mb-3">Permanently delete this group and all its data.</p>
        <button
          onClick={handleDelete}
          disabled={remove.isPending}
          className="px-4 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg disabled:opacity-50"
        >
          {remove.isPending ? 'Deleting…' : 'Delete group'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
