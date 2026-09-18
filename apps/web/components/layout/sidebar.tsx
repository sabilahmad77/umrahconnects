'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, BookOpen, Hotel, FileCheck2, Bus, DollarSign, Users2, Store, Rss, BarChart3,
  Settings, ChevronLeft, ChevronRight, Globe, LogOut, Map, Shield, ClipboardList, FolderOpen, Inbox,
  Building2, Zap, User, Package, BadgeCheck, MessageSquare, Clock, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/system';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/components/providers/auth-provider';
import type { DashboardType } from '@/lib/auth';
import {
  isPendingOrganization,
  layoutFor,
  navigationFor,
  normalizePath,
  workspaceKind,
  type NavKey,
} from '@/lib/workspace-access';

/** Icon of each menu entry. Which entries appear is decided in lib/workspace-access.ts. */
const ICONS: Record<NavKey, LucideIcon> = {
  overview: LayoutDashboard, tenants: Globe, users: Users, listings: Store, kyc: Shield, inquiries: Inbox,
  roles: ClipboardList, logs: BarChart3, support: FileCheck2, platformSettings: Shield,
  dashboard: LayoutDashboard, pilgrims: Users, bookings: BookOpen, packages: Package, groups: Users2,
  hotels: Hotel, transport: Bus, visa: FileCheck2, finance: DollarSign, reports: BarChart3,
  hotelDashboard: LayoutDashboard, hotelBookings: BookOpen,
  transportDashboard: LayoutDashboard, vehicles: Bus, drivers: Users, routes: Map, assignments: ClipboardList,
  transportBookings: BookOpen,
  visaDashboard: LayoutDashboard, visaApplications: FileCheck2, applicants: Users, visaDocuments: FolderOpen,
  serviceRequests: Inbox,
  financeDashboard: LayoutDashboard, invoices: DollarSign, payments: ClipboardList, budgetPlans: BarChart3,
  marketplace: Store, social: Rss, connections: Users, requests: BookOpen, discover: Globe,
  messages: MessageSquare, myGroups: Users2, myRequests: FileCheck2, myOffers: DollarSign, myBookings: BookOpen,
  travelPlan: Map, profile: Shield, registerOrganization: Building2, verification: BadgeCheck,
};

// Single deep-green sidebar across all roles (matches design references); the
// workspace is shown by a gold-accented badge. Platform accounts get the
// navy variant so the console is never mistaken for an organization.
const WORKSPACE_BADGE: Record<DashboardType, { label: string; Icon: LucideIcon }> = {
  operator: { label: 'Umrah Operator / Agency', Icon: Building2 },
  admin: { label: 'Super Admin', Icon: Zap },
  hotel: { label: 'Hotel Owner', Icon: Hotel },
  transport: { label: 'Transport Company', Icon: Bus },
  compliance: { label: 'Visa Agency', Icon: FileCheck2 },
  finance: { label: 'Finance Manager', Icon: DollarSign },
  pilgrim: { label: 'Traveler / Pilgrim', Icon: User },
};

export function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname() ?? '/';
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuthContext();

  const sections = navigationFor(user);
  const platform = !!user && workspaceKind(user) === 'platform';
  const pending = isPendingOrganization(user);
  const badge = pending
    ? { label: 'Verification pending', Icon: Clock }
    : WORKSPACE_BADGE[user ? layoutFor(user) : 'operator'];
  const initials = (user?.displayName ?? 'UC')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const current = normalizePath(pathname);

  return (
    <aside
      className={cn(
        'relative flex h-full shrink-0 flex-col text-white transition-[width] duration-150',
        platform ? 'bg-navy' : 'bg-brand-600',
        mobile ? 'min-h-[75dvh] w-full' : collapsed ? 'w-[68px]' : 'w-[240px]',
      )}
    >
      {/* ── Logo ── */}
      <div className={cn('flex items-center gap-3 border-b border-white/10 px-4 py-4', collapsed && 'justify-center px-3')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark-light.png" alt="Umrah Connect" className="h-6 w-6 object-contain" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-bold leading-none text-white">Umrah Connect</p>
            <p className="mt-1 truncate text-xs tracking-[0.18em] text-gold-400">CONNECTED JOURNEYS</p>
          </div>
        )}
      </div>

      {/* ── Workspace badge (expanded only) ── */}
      {!collapsed && (
        <div className="border-b border-white/10 px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-gold-300">
            <badge.Icon className="h-3 w-3" />
            {badge.label}
          </span>
        </div>
      )}

      {/* ── Navigation ── */}
      <nav aria-label="Workspace" className="scrollbar-hide flex-1 overflow-y-auto py-3">
        {sections.map((section) => (
          <div key={section.section} className="mb-2">
            {!collapsed && (
              <p className="px-4 py-1 text-xs font-bold uppercase tracking-widest text-white/70">{section.section}</p>
            )}
            {section.items.map((entry) => {
              const target = normalizePath(entry.href);
              const anchored = entry.href.includes('#');
              const active = !anchored && (current === target || (target !== '/' && current.startsWith(`${target}/`)));
              const Icon = ICONS[entry.key];
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  aria-label={entry.label}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? entry.label : undefined}
                  data-nav-href={target}
                  className={cn(
                    'relative mx-2 flex items-center gap-3 rounded-lg px-2.5 py-3 text-sm transition-all duration-150',
                    collapsed && 'justify-center',
                    active ? 'bg-white/12 font-semibold text-white' : 'text-white/80 hover:bg-white/5 hover:text-white',
                  )}
                >
                  {active && !collapsed && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-gold-400" />
                  )}
                  <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-gold-300' : 'text-white/75')} />
                  {!collapsed && <span className="truncate">{entry.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── User + bottom actions ── */}
      <div className="space-y-0.5 border-t border-white/10 p-2">
        {!collapsed && user && (
          <div className="mb-1 flex items-center gap-2.5 rounded-xl bg-white/5 px-2.5 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-500 text-xs font-bold text-brand-900">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{user.displayName}</p>
              {/* The account's own identity, or nothing. */}
              {user.email && <p className="truncate text-xs text-white/70">{user.email}</p>}
            </div>
          </div>
        )}
        <Link
          href="/settings"
          aria-label="Settings"
          title={collapsed ? 'Settings' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg px-2.5 py-3 text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white',
            collapsed && 'justify-center',
          )}
        >
          <Settings className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && 'Settings'}
        </Link>
        <Button
          variant="quiet"
          type="button"
          onClick={logout}
          aria-label="Sign out"
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] text-white/80 transition-colors hover:bg-white/10 hover:text-white',
            collapsed && 'justify-center',
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && 'Sign out'}
        </Button>
      </div>

      {/* ── Collapse toggle ── */}
      <Button
        variant="quiet"
        type="button"
        hidden={mobile}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-5 top-[72px] z-20 flex h-11 w-11 items-center justify-center rounded-full border border-sandstone bg-white p-0 shadow-sm transition-colors hover:bg-gray-50"
      >
        {collapsed ? <ChevronRight className="h-3 w-3 text-brand-500" /> : <ChevronLeft className="h-3 w-3 text-brand-500" />}
      </Button>
    </aside>
  );
}
