'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { canOpenWorkspaceRoute } from '@/lib/workspace-access';
import { usePathname } from 'next/navigation';
import { useAuthContext, getDashboardPath } from '@/components/providers/auth-provider';
import { LoadingState, Alert } from '@/components/ui/system';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { Drawer } from '@/components/ui/system';

const NavigationContext = createContext({ openNavigation: () => {} });
export const useWorkspaceNavigation = () => useContext(NavigationContext);

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useAuthContext();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const permitted = !!user && canOpenWorkspaceRoute(pathname, user.roles);
  useEffect(() => setOpen(false), [pathname]);
  if (!isLoaded || !user) return <main className="min-h-dvh bg-ivory"><LoadingState label={isLoaded ? 'Opening sign in…' : 'Checking your session…'} /></main>;
  return <NavigationContext.Provider value={{ openNavigation: () => setOpen(true) }}><div className="workspace-shell flex h-dvh min-h-0 overflow-hidden bg-[#F4F6F3]"><a href="#workspace-main" className="skip-link">Skip to content</a><div className="hidden lg:flex"><Sidebar /></div><Drawer open={open} onOpenChange={setOpen} title="Workspace navigation"><Sidebar mobile /></Drawer><div className="flex min-w-0 flex-1 flex-col overflow-hidden"><Header /><main id="workspace-main" tabIndex={-1} className="workspace-main flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-7">{permitted ? children : <section className="mx-auto max-w-2xl space-y-4"><h1 className="text-2xl font-semibold">Platform administration unavailable</h1><Alert title="Super Admin account required">This account can use its assigned workspace. Platform administration requires a Super Admin account.</Alert><Link href={getDashboardPath(user.dashboardType)} className="uc-button uc-button-secondary">Return to your workspace</Link></section>}</main></div></div></NavigationContext.Provider>;
}
