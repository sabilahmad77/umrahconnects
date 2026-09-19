'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button, EmptyState, LoadingState, QueryFailure } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import {
  safeNotificationLink,
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotificationPages,
  type AppNotification,
} from '@/hooks/use-platform';
import { formatTimeAgo } from '@/components/social/social-utils';

/** Every notification of the signed-in user, with read state that persists on the server. */
export function NotificationsView() {
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const pages = useNotificationPages(unreadOnly);
  const markOne = useMarkNotificationsRead();
  const markAll = useMarkAllNotificationsRead();
  const items = pages.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = pages.data?.pages[0]?.unread ?? 0;

  const open = async (n: AppNotification) => {
    try {
      if (!n.readAt) await markOne.mutateAsync([n.id]);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'This notification could not be marked as read.'));
    }
    const link = safeNotificationLink(n.link);
    if (link) router.push(link);
  };

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="mt-0.5 text-sm text-gray-600">{pages.isLoading ? 'Loading…' : unread ? `${unread} unread` : 'You are all caught up.'}</p>
        </div>
        {unread > 0 && (
          <Button
            variant="secondary"
            busy={markAll.isPending}
            onClick={async () => {
              try {
                await markAll.mutateAsync();
                toast.success('All notifications marked as read');
              } catch (error) {
                toast.error(apiErrorMessage(error, 'Notifications could not be marked as read.'));
              }
            }}
          >
            {!markAll.isPending && <CheckCheck aria-hidden="true" className="h-4 w-4" />} Mark all as read
          </Button>
        )}
      </div>

      <div role="tablist" aria-label="Filter notifications" className="flex gap-1.5">
        {[
          { key: false, label: 'All' },
          { key: true, label: 'Unread' },
        ].map((t) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={unreadOnly === t.key}
            onClick={() => setUnreadOnly(t.key)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              unreadOnly === t.key ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {pages.error ? (
          <div className="p-4">
            <QueryFailure error={pages.error} onRetry={() => pages.refetch()} />
          </div>
        ) : pages.isLoading ? (
          <LoadingState label="Loading notifications…" />
        ) : !items.length ? (
          <EmptyState title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} description="Comments, replies, likes, messages and invitations appear here." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((n) => {
              const link = safeNotificationLink(n.link);
              return (
                <li key={n.id} className={cn('flex items-start gap-3 p-4', !n.readAt && 'bg-brand-50/60')} data-notification-id={n.id}>
                  <span aria-hidden="true" className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-600')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                    {n.body && <p className="mt-0.5 whitespace-pre-line break-words text-sm text-gray-600">{n.body}</p>}
                    <p className="mt-1 text-xs text-gray-600">
                      {formatTimeAgo(n.createdAt)}
                      {!n.readAt && ' · Unread'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                    {link && (
                      <Button variant="secondary" onClick={() => open(n)} className="px-3 py-1.5 text-xs">
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /> Open
                      </Button>
                    )}
                    {!n.readAt && (
                      <Button
                        variant="quiet"
                        busy={markOne.isPending && markOne.variables?.[0] === n.id}
                        onClick={async () => {
                          try {
                            await markOne.mutateAsync([n.id]);
                          } catch (error) {
                            toast.error(apiErrorMessage(error, 'This notification could not be marked as read.'));
                          }
                        }}
                        className="px-2 py-1.5 text-xs text-brand-700"
                      >
                        Mark as read
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {pages.hasNextPage && (
        <Button variant="secondary" busy={pages.isFetchingNextPage} onClick={() => pages.fetchNextPage()} className="w-full">
          <Bell aria-hidden="true" className="h-4 w-4" /> Load older notifications
        </Button>
      )}
    </div>
  );
}
