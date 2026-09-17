'use client';

import * as Popover from '@radix-ui/react-popover';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { useNotifications, useMarkAllNotificationsRead, useMarkNotificationsRead } from '@/hooks/use-platform';
import { Button, EmptyState, ErrorState, LoadingState } from '@/components/ui/system';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { data, isLoading, error, refetch } = useNotifications({ page: 1, limit: 12 });
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationsRead();
  const items: any[] = data?.items ?? [];
  const unread = error || isLoading ? 0 : (data?.unread ?? 0);
  return <Popover.Root><Popover.Trigger asChild><Button variant="quiet" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative px-3"><Bell aria-hidden="true" className="h-5 w-5" />{unread > 0 && <span className="absolute right-0 top-0 rounded-full bg-brand-600 px-1 text-xs text-white">{unread > 9 ? '9+' : unread}</span>}</Button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={8} className="z-50 w-[min(380px,calc(100vw-32px))] rounded-xl border border-gray-200 bg-white shadow-xl"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-4"><h2 className="font-semibold">Notifications</h2>{unread > 0 && <Button variant="quiet" busy={markAll.isPending} onClick={async () => { try { try { await markAll.mutateAsync(); } catch { toast.error('Could not mark notifications as read. Try again.'); } } catch (error) { toast.error((error as any)?.response?.data?.error?.message ?? (error as any)?.response?.data?.message ?? 'This action could not be completed. Try again.'); } }}>Mark all read</Button>}</div><div className="max-h-[65dvh] overflow-y-auto">{isLoading ? <LoadingState /> : error ? <div className="p-4"><ErrorState onRetry={() => refetch()} /></div> : !items.length ? <EmptyState title="No notifications yet" /> : items.map(n => <Button key={n.id} variant="quiet" disabled={markOne.isPending} onClick={async () => { try { try { if (!n.readAt) await markOne.mutateAsync([n.id]); } catch { toast.error('Could not mark this notification as read.'); } } catch (error) { toast.error((error as any)?.response?.data?.error?.message ?? (error as any)?.response?.data?.message ?? 'This action could not be completed. Try again.'); } }} className={cn('block w-full rounded-none border-b border-gray-200 p-4 text-left', !n.readAt && 'bg-brand-50')}><span className="block text-sm font-semibold">{n.title}</span>{n.body && <span className="mt-1 block whitespace-normal text-sm text-gray-600">{n.body}</span>}<span className="mt-2 block text-xs text-gray-600">{new Date(n.createdAt).toLocaleString()}{!n.readAt ? ' · Unread' : ''}</span></Button>)}</div><Popover.Close asChild><Button variant="quiet" className="w-full">Close notifications</Button></Popover.Close></Popover.Content></Popover.Portal></Popover.Root>;
}
