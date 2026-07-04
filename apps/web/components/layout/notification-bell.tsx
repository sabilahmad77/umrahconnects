'use client';

import { useState } from 'react';
import { Bell, Check, MailOpen, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNotifications, useMarkAllNotificationsRead, useMarkNotificationsRead } from '@/hooks/use-platform';
import { cn } from '@/lib/utils';

const TYPE_LABEL: Record<string, string> = {
  POST_COMMENT: '💬',
  POST_REACTION: '❤️',
  COMMENT_REPLY: '↩️',
  CONNECTION_REQUEST: '🤝',
  CONNECTION_ACCEPTED: '✅',
  FOLLOW: '👤',
  MESSAGE: '✉️',
  REQUEST_OFFER: '💼',
  REQUEST_OFFER_ACCEPTED: '🎉',
  REQUEST_OFFER_REJECTED: '😞',
  GROUP_INVITE: '👥',
  SYSTEM: '🔔',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data, refetch } = useNotifications({ page: 1, limit: 12 });
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationsRead();

  const items: any[] = data?.items ?? [];
  const unread = data?.unread ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 min-w-[18px] px-1 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-100 rounded-2xl shadow-xl z-40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-semibold text-sm text-gray-900">Notifications</p>
              {unread > 0 && (
                <button
                  onClick={async () => { await markAll.mutateAsync(); refetch(); }}
                  className="text-xs text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 font-medium"
                >
                  <MailOpen className="h-3 w-3" /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <Bell className="h-6 w-6 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">You're all caught up.</p>
                </div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={async () => {
                      if (!n.readAt) await markOne.mutateAsync([n.id]);
                      setOpen(false);
                      if (n.link) router.push(n.link);
                    }}
                    className={cn(
                      'w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex gap-3',
                      !n.readAt && 'bg-brand-50/40',
                    )}
                  >
                    <div className="text-xl shrink-0 leading-none mt-0.5">
                      {TYPE_LABEL[n.type] ?? '🔔'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm', !n.readAt ? 'font-semibold text-gray-900' : 'text-gray-700')}>
                        {n.title}
                      </p>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {!n.readAt && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-2" />}
                  </button>
                ))
              )}
            </div>

            {items.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-100 text-center">
                <button
                  onClick={() => { setOpen(false); router.push('/notifications'); }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  View all
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
