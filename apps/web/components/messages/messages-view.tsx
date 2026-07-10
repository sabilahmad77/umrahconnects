'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, MessageSquare, Send, AlertCircle, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useConversations, useMessages, useSendMessage, useOpenConversation } from '@/hooks/use-platform';
import { useDiscoverPeople } from '@/hooks/use-social';

export function MessagesView() {
  const { data: conversations, isLoading, error, refetch } = useConversations();
  const [active, setActive] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const items = conversations?.items ?? [];

  useEffect(() => {
    if (!active && items.length > 0) setActive(items[0].id);
  }, [active, items]);

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-sm text-gray-500 mt-0.5">Direct messages with your connections.</p>
        </div>
        <button
          onClick={() => setComposeOpen(true)}
          className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" /> New message
        </button>
      </div>

      {composeOpen && (
        <NewMessageModal
          onClose={() => setComposeOpen(false)}
          onOpened={(id) => { setComposeOpen(false); setActive(id); refetch(); }}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 min-h-[60vh]">
        {/* Sidebar list */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-100 text-xs font-semibold text-gray-600">
            Conversations ({items.length})
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="py-10 text-center text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-1" />Loading…</div>
            ) : error ? (
              <div className="py-10 text-center text-sm text-red-500"><AlertCircle className="h-5 w-5 mx-auto mb-1 opacity-60" />Failed to load</div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">No conversations yet — open one from a member profile or the Social Hub</div>
            ) : (
              items.map((c: any) => {
                const isActive = c.id === active;
                const lastMsg = c.lastMessage ?? c.lastMessageAt ?? '';
                return (
                  <button
                    key={c.id}
                    onClick={() => setActive(c.id)}
                    className={cn(
                      'w-full text-left flex items-start gap-3 px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors',
                      isActive && 'bg-brand-50/60',
                    )}
                  >
                    <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {(c.title ?? 'C').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.title ?? 'Conversation'}</p>
                      <p className="text-[11px] text-gray-500 truncate">{typeof lastMsg === 'string' ? lastMsg : new Date(lastMsg).toLocaleString()}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Active chat */}
        <div className="bg-white rounded-2xl border border-gray-100 flex flex-col">
          {active ? (
            <ChatPane conversationId={active} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
              <div className="text-center">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                Select a conversation
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewMessageModal({ onClose, onOpened }: { onClose: () => void; onOpened: (conversationId: string) => void }) {
  const { data, isLoading } = useDiscoverPeople();
  const open = useOpenConversation();
  const people: any[] = (data as any)?.items ?? (data as any) ?? [];

  const start = async (p: any) => {
    const recipientUserId = p.userId ?? p.id;
    try {
      const conv = await open.mutateAsync(recipientUserId);
      if (conv?.id) onOpened(conv.id);
      else { toast.error('Could not open conversation'); }
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Could not open conversation');
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold text-gray-900">New message</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500"><X className="h-4 w-4" /></button>
        </div>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-1" />Loading people…</div>
        ) : people.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No one to message yet — connect with people in Discover first.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {people.map((p: any) => {
              const name = p.displayName ?? p.name ?? 'Member';
              return (
                <button
                  key={p.id}
                  onClick={() => start(p)}
                  disabled={open.isPending}
                  className="w-full flex items-center gap-3 px-2 py-3 text-left hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                    <p className="text-[11px] text-gray-500 truncate">{p.tenant?.name ?? p.headline ?? 'Umrah Connect'}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPane({ conversationId }: { conversationId: string }) {
  const { data: messages = [], isLoading } = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const items = Array.isArray(messages) ? messages : ((messages as any).items ?? []);

  const submit = async () => {
    if (!text.trim()) return;
    try {
      await send.mutateAsync(text.trim());
      setText('');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to send');
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="text-center text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-1" />Loading messages…</div>
        ) : items.length === 0 ? (
          <div className="text-center text-sm text-gray-500">No messages yet — say hi</div>
        ) : (
          items.map((m: any, i: number) => (
            <div key={m.id ?? i} className="max-w-md">
              <div className="bg-gray-100 rounded-2xl px-3 py-2 text-sm text-gray-800">
                {m.body ?? m.content}
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">{m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-gray-100 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Type a message…"
          className="flex-1 text-sm px-3 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-brand-400"
        />
        <button
          onClick={submit}
          disabled={send.isPending || !text.trim()}
          className="flex items-center gap-2 px-4 py-2.5 text-sm bg-brand-500 text-white rounded-xl disabled:opacity-50"
        >
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
        </button>
      </div>
    </>
  );
}
