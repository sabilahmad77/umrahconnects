'use client';

import Link from 'next/link';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Menu, ChevronDown, LogOut, Settings, User, HelpCircle } from 'lucide-react';
import { NotificationBell } from './notification-bell';
import { useAuthContext } from '@/components/providers/auth-provider';
import { useWorkspaceNavigation } from './workspace-shell';
import { Button, Avatar } from '@/components/ui/system';
import { canOpenRoute, isPendingOrganization, workspaceKind, workspaceLabel } from '@/lib/workspace-access';

export function Header() {
  const { user, logout } = useAuthContext();
  const { openNavigation } = useWorkspaceNavigation();
  const name = user?.displayName || 'Account';
  const kind = user ? workspaceKind(user) : null;
  const scope =
    kind === 'platform'
      ? 'Cross-tenant scope'
      : user?.tenantName || (user?.tenantId ? 'Tenant workspace' : 'Personal account');
  // Notifications are answered only for verified organizations; while an
  // organization is pending the API refuses them, so the bell is not shown.
  const notifications = !!user && !isPendingOrganization(user);
  const profile = canOpenRoute(user, '/profile');

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="quiet" onClick={openNavigation} aria-label="Open workspace navigation" className="px-3 lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand-700">{user ? workspaceLabel(user) : 'Workspace'}</p>
          <p className="truncate text-xs text-gray-600">{scope}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href="/help"
          aria-label="Help center"
          className="hidden h-11 w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-50 sm:flex"
        >
          <HelpCircle className="h-5 w-5" />
        </Link>
        {notifications && <NotificationBell />}
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <Button variant="quiet" aria-label="Account menu" className="px-2 sm:px-4">
              <Avatar name={name} />
              <span className="hidden max-w-36 truncate sm:block">{name}</span>
              <ChevronDown className="hidden h-4 w-4 sm:block" />
            </Button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              align="end"
              sideOffset={8}
              className="z-[70] min-w-60 rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
            >
              <div className="border-b border-gray-200 px-3 py-3">
                <p className="text-sm font-semibold">{name}</p>
                <p className="max-w-64 break-all text-xs text-gray-600">{user?.email}</p>
              </div>
              {profile && (
                <Dropdown.Item asChild>
                  <Link href="/profile" className="uc-menu-item">
                    <User className="h-4 w-4" />
                    Profile
                  </Link>
                </Dropdown.Item>
              )}
              <Dropdown.Item asChild>
                <Link href="/settings" className="uc-menu-item">
                  <Settings className="h-4 w-4" />
                  Account settings
                </Link>
              </Dropdown.Item>
              <Dropdown.Item asChild>
                <Link href="/help" className="uc-menu-item">
                  <HelpCircle className="h-4 w-4" />
                  Help center
                </Link>
              </Dropdown.Item>
              <Dropdown.Item onSelect={() => logout()} className="uc-menu-item text-red-700">
                <LogOut className="h-4 w-4" />
                Sign out
              </Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
    </header>
  );
}
