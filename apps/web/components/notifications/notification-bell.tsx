'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { safeNotificationLink, useMarkAllNotificationsRead, useMarkNotificationsRead, useNotifications } from '@/hooks/use-platform';
import { Button, EmptyState, ErrorState, LoadingState } from '@/components/ui/system';
import { formatTimeAgo } from '@/components/social/social-utils';

/**
 * Header bell: unread count, the latest notifications, mark one / all as read.
 * Choosing a notification marks it read and opens what it is about (in-app
 * links only). Drop-in replacement for components/layout/notification-bell.tsx.
 */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useNotifications({ page: 1, limit: 12 });
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationsRead();
  const items = data?.items ?? [];
  const unread = error || isLoading ? 0 : data?.unread ?? 0;

  const choose = async (n: (typeof items)[number]) => {
    try {
      if (!n.readAt) await markOne.mutateAsync([n.id]);
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Could not mark this notification as read.'));
    }
    const link = safeNotificationLink(n.link);
    if (link) {
      setOpen(false);
      router.push(link);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button variant="quiet" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative px-3">
          <Bell aria-hidden="true" className="h-5 w-5" />
          {unread > 0 && <span className="absolute right-0 top-0 rounded-full bg-brand-600 px-1 text-xs text-white">{unread > 9 ? '9+' : unread}</span>}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[min(380px,calc(100vw-32px))] rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-4">
            <h2 className="font-semibold">Notifications</h2>
            {unread > 0 && (
              <Button
                variant="quiet"
                busy={markAll.isPending}
                onClick={async () => {
                  try {
                    await markAll.mutateAsync();
                  } catch (e) {
                    toast.error(apiErrorMessage(e, 'Could not mark notifications as read. Try again.'));
                  }
                }}
              >
                Mark all read
              </Button>
            )}
          </div>
          <div className="max-h-[65dvh] overflow-y-auto">
            {isLoading ? (
              <LoadingState />
            ) : error ? (
              <div className="p-4">
                <ErrorState onRetry={() => refetch()} />
              </div>
            ) : !items.length ? (
              <EmptyState title="No notifications yet" />
            ) : (
              items.map((n: any) => (
                <Button
                  key={n.id}
                  variant="quiet"
                  disabled={markOne.isPending}
                  onClick={() => choose(n)}
                  className={cn('block w-full rounded-none border-b border-gray-200 p-4 text-left', !n.readAt && 'bg-brand-50')}
                >
                  <span className="block text-sm font-semibold">{n.title}</span>
                  {n.body && <span className="mt-1 block whitespace-normal text-sm text-gray-600">{n.body}</span>}
                  <span className="mt-2 block text-xs text-gray-600">
                    {formatTimeAgo(n.createdAt)}
                    {!n.readAt ? ' · Unread' : ''}
                  </span>
                </Button>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-2 p-2">
            <Link href="/notifications" onClick={() => setOpen(false)} className="px-3 py-2 text-sm font-semibold text-brand-700 hover:underline">
              See all notifications
            </Link>
            <Popover.Close asChild>
              <Button variant="quiet">Close</Button>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
