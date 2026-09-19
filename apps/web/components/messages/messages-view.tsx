'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, MessageSquare, Plus, Search, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, ModalSurface, QueryFailure } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useConversations, useMessages, useOpenConversation, useSendMessage } from '@/hooks/use-platform';
import { useDiscoverPeople } from '@/hooks/use-social';
import { formatTimeAgo, initialsOf } from '@/components/social/social-utils';

export function MessagesView() {
  const router = useRouter();
  const params = useSearchParams();
  const conversations = useConversations();
  const [composeOpen, setComposeOpen] = useState(false);
  const items = useMemo(() => conversations.data?.items ?? [], [conversations.data]);
  const requested = params.get('c');
  const active = requested ?? items[0]?.id ?? null;
  const activeConversation = items.find((c: any) => c.id === active);

  const select = (id: string) => router.replace(`/messages?c=${id}`);

  if (conversations.error) return <QueryFailure error={conversations.error} onRetry={() => conversations.refetch()} />;
  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="mt-0.5 text-sm text-gray-600">Private conversations with people on Umrah Connect.</p>
        </div>
        <Button
          variant="quiet"
          onClick={() => setComposeOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm text-white shadow-sm transition-colors hover:bg-brand-600"
        >
          <Plus aria-hidden="true" className="h-4 w-4" /> New message
        </Button>
      </div>

      {composeOpen && (
        <NewMessageModal
          onClose={() => setComposeOpen(false)}
          onOpened={(id) => {
            setComposeOpen(false);
            conversations.refetch();
            select(id);
          }}
        />
      )}

      <div className="grid min-h-[60vh] grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <nav aria-label="Conversations" className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-3 text-xs font-semibold text-gray-600">Conversations ({items.length})</div>
          <div className="flex-1 overflow-y-auto">
            {conversations.isLoading ? (
              <p role="status" className="py-10 text-center text-sm text-gray-600">
                <Loader2 aria-hidden="true" className="mx-auto mb-1 h-5 w-5 animate-spin" />
                Loading…
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-600">No conversations yet — start one with “New message”.</p>
            ) : (
              items.map((c: any) => {
                const name = c.other?.displayName ?? c.name ?? 'Conversation';
                const preview = c.latest ? `${c.latest.isMine ? 'You: ' : ''}${c.latest.body}` : 'No messages yet';
                return (
                  <button
                    type="button"
                    key={c.id}
                    aria-current={c.id === active ? 'true' : undefined}
                    onClick={() => select(c.id)}
                    className={cn(
                      'flex w-full items-start gap-3 border-b border-gray-50 px-3 py-3 text-left transition-colors hover:bg-gray-50',
                      c.id === active && 'bg-brand-50/60',
                    )}
                  >
                    <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                      {initialsOf(name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium text-gray-900">{name}</p>
                        {c.lastMessageAt && <span className="shrink-0 text-[11px] text-gray-600">{formatTimeAgo(c.lastMessageAt)}</span>}
                      </div>
                      <p className="truncate text-xs text-gray-600">{preview}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </nav>

        <section aria-label="Conversation" className="flex min-h-[50vh] flex-col rounded-xl border border-gray-200 bg-white">
          {active ? (
            <ChatPane key={active} conversationId={active} title={activeConversation?.other?.displayName} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-600">
              <div className="text-center">
                <MessageSquare aria-hidden="true" className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                Select or start a conversation
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function NewMessageModal({ onClose, onOpened }: { onClose: () => void; onOpened: (conversationId: string) => void }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const people = useDiscoverPeople(query || undefined, 20);
  const open = useOpenConversation();

  const start = async (userId: string) => {
    try {
      const conv = await open.mutateAsync(userId);
      onOpened(conv.id);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The conversation could not be opened. Try again.'));
    }
  };

  return (
    <ModalSurface busy={open.isPending} title="New message" onClose={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading font-bold text-gray-900">New message</h2>
          <Button disabled={open.isPending} variant="quiet" aria-label="Close dialog" onClick={onClose} className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-50">
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
          <Search aria-hidden="true" className="h-4 w-4 text-gray-600" />
          <Input
            autoFocus
            aria-label="Search people"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or city…"
            className="min-h-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none"
          />
        </div>
        {people.error ? (
          <QueryFailure error={people.error} onRetry={() => people.refetch()} />
        ) : people.isLoading ? (
          <p role="status" className="py-8 text-center text-sm text-gray-600">
            <Loader2 aria-hidden="true" className="mx-auto mb-1 h-5 w-5 animate-spin" />
            Loading people…
          </p>
        ) : !people.data?.length ? (
          <p className="py-8 text-center text-sm text-gray-600">{query ? `No one matches “${query}”.` : 'No one to message yet.'}</p>
        ) : (
          <ul className="max-h-80 divide-y divide-gray-50 overflow-y-auto">
            {people.data
              .filter((p) => p.connection?.status !== 'UNAVAILABLE')
              .map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => start(p.userId)}
                    disabled={open.isPending}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
                      {initialsOf(p.displayName)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{p.displayName}</p>
                      <p className="truncate text-xs text-gray-600">
                        {p.connection?.status === 'ACCEPTED' ? 'Connection' : p.type === 'PILGRIM' ? 'Traveler' : 'Provider'}
                        {p.city ? ` · ${p.city}` : ''}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </ModalSurface>
  );
}

function ChatPane({ conversationId, title }: { conversationId: string; title?: string }) {
  const messages = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Page 1 is the newest; older pages follow. Oldest first on screen.
  const items = useMemo(() => [...(messages.data?.pages ?? [])].reverse().flatMap((p) => p.items), [messages.data]);
  const newestId = items[items.length - 1]?.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [newestId]);

  const submit = async () => {
    const body = text.trim();
    if (!body || send.isPending) return;
    try {
      await send.mutateAsync(body);
      setText('');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Your message could not be sent. Try again.'));
    }
  };

  if (messages.error) return <QueryFailure error={messages.error} onRetry={() => messages.refetch()} />;
  return (
    <>
      <div className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">{title ?? 'Conversation'}</div>
      <div className="max-h-[60vh] flex-1 space-y-2 overflow-y-auto p-4">
        {messages.hasNextPage && (
          <div className="text-center">
            <Button variant="quiet" busy={messages.isFetchingNextPage} onClick={() => messages.fetchNextPage()} className="text-xs font-semibold text-brand-700">
              Load earlier messages
            </Button>
          </div>
        )}
        {messages.isLoading ? (
          <p role="status" className="text-center text-sm text-gray-600">
            <Loader2 aria-hidden="true" className="mx-auto mb-1 h-5 w-5 animate-spin" />
            Loading messages…
          </p>
        ) : items.length === 0 ? (
          <p className="text-center text-sm text-gray-600">No messages yet — say salam.</p>
        ) : (
          items.map((m: any) => (
            <div key={m.id} className={cn('flex flex-col', m.isMine ? 'items-end' : 'items-start')}>
              {!m.isMine && <p className="mb-0.5 px-1 text-[11px] font-semibold text-gray-600">{m.sender?.displayName ?? 'Member'}</p>}
              <div className={cn('max-w-md whitespace-pre-line break-words rounded-xl px-3 py-2 text-sm', m.isMine ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-800')}>
                {m.body}
              </div>
              <p className="mt-0.5 px-1 text-[11px] text-gray-600">{new Date(m.createdAt).toLocaleString()}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-gray-200 p-3">
        <Input
          aria-label="Type a message"
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Type a message…"
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
        />
        <Button
          variant="quiet"
          onClick={submit}
          disabled={!text.trim()}
          busy={send.isPending}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm text-white disabled:opacity-50"
        >
          {!send.isPending && <Send aria-hidden="true" className="h-4 w-4" />} Send
        </Button>
      </div>
    </>
  );
}
