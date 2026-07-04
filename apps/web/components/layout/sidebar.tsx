'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/components/providers/auth-provider';
import {
  LayoutDashboard, Users, BookOpen, Hotel, FileCheck2, Bus,
  DollarSign, Users2, Store, Rss, BarChart3, Settings,
  ChevronLeft, ChevronRight, Globe, LogOut, Map, Shield, BedDouble, ClipboardList,
  FolderOpen, Inbox, Building2, Zap, User,
} from 'lucide-react';
import type { DashboardType } from '@/lib/auth';

// ─── Navigation configs per role ─────────────────────────────────────────────

// Shared platform-wide sections every role gets at the bottom
const SHARED_PLATFORM = [
  {
    section: 'Shared platform',
    items: [
      { label: 'Marketplace',  href: '/marketplace', icon: Store },
      { label: 'Social Hub',   href: '/social',      icon: Rss },
      { label: 'Connections',  href: '/connections', icon: Users },
      { label: 'Groups',       href: '/groups',      icon: Users2 },
      { label: 'Requests',     href: '/requests',    icon: BookOpen },
    ],
  },
];

const NAV: Record<DashboardType, { section: string; items: { label: string; href: string; icon: any; badge?: string }[] }[]> = {
  operator: [
    {
      section: 'My CRM',
      items: [
        { label: 'Dashboard',         href: '/dashboard',  icon: LayoutDashboard },
        { label: 'Pilgrims & CRM',    href: '/pilgrims',   icon: Users },
        { label: 'Bookings',          href: '/bookings',   icon: BookOpen },
        { label: 'Groups',            href: '/groups',     icon: Users2 },
      ],
    },
    {
      section: 'My Inventory',
      items: [
        { label: 'Hotels',            href: '/hotels',     icon: Hotel },
        { label: 'Transport',         href: '/transport',  icon: Bus },
        { label: 'Visa & Compliance', href: '/compliance', icon: FileCheck2 },
      ],
    },
    {
      section: 'My Finance',
      items: [
        { label: 'Finance',           href: '/finance',    icon: DollarSign },
        { label: 'Reports',           href: '/reports',    icon: BarChart3 },
      ],
    },
    ...SHARED_PLATFORM,
  ],

  admin: [
    {
      section: 'Platform control',
      items: [
        { label: 'Overview',                href: '/admin-dashboard', icon: LayoutDashboard },
        { label: 'All Tenants',             href: '/admin-tenants',   icon: Globe },
        { label: 'All Users',               href: '/admin-users',     icon: Users },
        { label: 'All Pilgrims',            href: '/pilgrims',        icon: Users },
        { label: 'All Bookings',            href: '/bookings',        icon: BookOpen },
        { label: 'All Groups',              href: '/groups',          icon: Users2 },
        { label: 'Marketplace Listings',    href: '/admin-listings',  icon: Store },
      ],
    },
    {
      section: 'Governance',
      items: [
        { label: 'KYC Verification',        href: '/admin-kyc',       icon: Shield },
        { label: 'Website Inquiries',       href: '/admin-inquiries', icon: Inbox },
        { label: 'Roles & Permissions',     href: '/admin-roles',     icon: ClipboardList },
        { label: 'System Logs',             href: '/admin-logs',      icon: BarChart3 },
        { label: 'Support / Issues',        href: '/admin-support',   icon: FileCheck2 },
      ],
    },
    {
      section: 'Intelligence',
      items: [
        { label: 'Reports & Analytics',     href: '/reports',         icon: BarChart3 },
        { label: 'Finance',                 href: '/finance',         icon: DollarSign },
      ],
    },
    ...SHARED_PLATFORM,
    {
      section: 'Config',
      items: [{ label: 'Platform Settings', href: '/admin-settings',  icon: Shield }],
    },
  ],

  hotel: [
    {
      section: 'My Hotel CRM',
      items: [
        { label: 'Dashboard',         href: '/hotel-dashboard', icon: LayoutDashboard },
        { label: 'My Hotels',         href: '/hotels',          icon: Hotel },
        { label: 'Rooms & Inventory', href: '/hotels',          icon: BedDouble },
        { label: 'Bookings',          href: '/hotel-bookings',  icon: BookOpen },
        { label: 'Finance',           href: '/finance',         icon: DollarSign },
      ],
    },
    ...SHARED_PLATFORM,
  ],

  transport: [
    {
      section: 'My Fleet CRM',
      items: [
        { label: 'Dashboard',         href: '/transport-dashboard',   icon: LayoutDashboard },
        { label: 'Vehicles & Fleet',  href: '/transport/vehicles',    icon: Bus },
        { label: 'Drivers',           href: '/transport/drivers',     icon: Users },
        { label: 'Routes',            href: '/transport/routes',      icon: Map },
        { label: 'Assignments',       href: '/transport/assignments', icon: ClipboardList },
        { label: 'Bookings',          href: '/transport/bookings',    icon: BookOpen },
        { label: 'Finance',           href: '/finance',               icon: DollarSign },
      ],
    },
    ...SHARED_PLATFORM,
  ],

  compliance: [
    {
      section: 'My Visa CRM',
      items: [
        { label: 'Dashboard',          href: '/visa-dashboard',  icon: LayoutDashboard },
        { label: 'Visa Applications',  href: '/compliance',      icon: FileCheck2 },
        { label: 'Pilgrims / Applicants', href: '/pilgrims',     icon: Users },
        { label: 'Document Management', href: '/visa-documents', icon: FolderOpen },
        { label: 'Service Requests',   href: '/visa-requests',   icon: Inbox },
        { label: 'Finance',            href: '/finance',         icon: DollarSign },
        { label: 'Reports',            href: '/reports',         icon: BarChart3 },
      ],
    },
    ...SHARED_PLATFORM,
  ],

  finance: [
    {
      section: 'My Finance CRM',
      items: [
        { label: 'Dashboard',     href: '/finance-dashboard', icon: LayoutDashboard },
        { label: 'Invoices',      href: '/finance',           icon: DollarSign },
        { label: 'Payments',      href: '/finance-payments',  icon: ClipboardList },
        { label: 'Bookings',      href: '/bookings',          icon: BookOpen },
        { label: 'Budget Plans',  href: '/budget-plans',      icon: BarChart3 },
        { label: 'Reports',       href: '/reports',           icon: BarChart3 },
      ],
    },
    ...SHARED_PLATFORM,
  ],

  pilgrim: [
    {
      section: 'Community',
      items: [
        { label: 'Social Hub',        href: '/social',       icon: Rss },
        { label: 'Discover',          href: '/discover',     icon: Globe },
        { label: 'Connections',       href: '/connections',  icon: Users },
        { label: 'Messages',          href: '/messages',     icon: BookOpen },
        { label: 'Groups',            href: '/groups',       icon: Users2 },
      ],
    },
    {
      section: 'My Travel',
      items: [
        { label: 'Marketplace',       href: '/marketplace',  icon: Store },
        { label: 'My Requests',       href: '/requests',     icon: FileCheck2 },
        { label: 'My Offers',         href: '/my-offers',    icon: DollarSign },
        { label: 'My Bookings',       href: '/my-bookings',  icon: BookOpen },
        { label: 'My Travel Plan',    href: '/travel-plan',  icon: Map },
      ],
    },
    {
      section: 'Account',
      items: [
        { label: 'Profile',           href: '/profile',      icon: Shield },
      ],
    },
  ],
};

// Routes that should also be in the operator/admin sidebar so they can act as providers
const PROVIDER_NAV_EXTRAS = [
  { label: 'My Connections', href: '/connections', icon: Users },
];

// Single deep-green sidebar across all roles (matches design references); role is shown via a gold-accented badge.
const ROLE_CONFIG: Record<DashboardType, { label: string; Icon: any; gradient: string; badge: string }> = {
  operator:   { label: 'Umrah Operator / Agency', Icon: Building2,  gradient: 'from-brand-500 to-brand-600', badge: 'bg-white/10 text-gold-300' },
  admin:      { label: 'Super Admin',         Icon: Zap,        gradient: 'from-brand-500 to-brand-600', badge: 'bg-white/10 text-gold-300' },
  hotel:      { label: 'Hotel Owner',         Icon: Hotel,      gradient: 'from-brand-500 to-brand-600', badge: 'bg-white/10 text-gold-300' },
  transport:  { label: 'Transport Company',   Icon: Bus,        gradient: 'from-brand-500 to-brand-600', badge: 'bg-white/10 text-gold-300' },
  compliance: { label: 'Visa Agency',         Icon: FileCheck2, gradient: 'from-brand-500 to-brand-600', badge: 'bg-white/10 text-gold-300' },
  finance:    { label: 'Finance Manager',     Icon: DollarSign, gradient: 'from-brand-500 to-brand-600', badge: 'bg-white/10 text-gold-300' },
  pilgrim:    { label: 'Traveler / Pilgrim',  Icon: User,       gradient: 'from-brand-500 to-brand-600', badge: 'bg-white/10 text-gold-300' },
};

// ─── Sidebar Component ────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuthContext();

  const dashboardType = user?.dashboardType ?? 'operator';
  const navSections = NAV[dashboardType] ?? NAV.operator;
  const roleCfg = ROLE_CONFIG[dashboardType] ?? ROLE_CONFIG.operator;
  const initials = (user?.displayName ?? 'UC').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside
      className={cn(
        'relative flex flex-col bg-brand-600 text-white transition-all duration-300 ease-in-out shrink-0',
        collapsed ? 'w-[68px]' : 'w-[244px]',
      )}
    >
      {/* ── Logo ── */}
      <div className={cn(
        'flex items-center gap-3 px-4 py-4 border-b border-white/10',
        collapsed && 'justify-center px-3',
      )}>
        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark-light.png" alt="Umrah Connect" className="w-6 h-6 object-contain" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-heading font-bold leading-none text-white truncate">Umrah Connect</p>
            <p className="text-[9px] tracking-[0.18em] text-gold-400 mt-1 truncate">CONNECTED JOURNEYS</p>
          </div>
        )}
      </div>

      {/* ── Role badge (expanded only) ── */}
      {!collapsed && (
        <div className="px-3 py-2.5 border-b border-white/10">
          <span className={cn('inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full', roleCfg.badge)}>
            <roleCfg.Icon className="h-3 w-3" />
            {roleCfg.label}
          </span>
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-3 scrollbar-hide">
        {navSections.map((section) => (
          <div key={section.section} className="mb-2">
            {!collapsed && (
              <p className="px-4 py-1 text-[9px] font-bold text-white/35 uppercase tracking-widest">
                {section.section}
              </p>
            )}
            {section.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/' && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'relative flex items-center gap-3 mx-2 px-2.5 py-2 rounded-xl text-[13px] transition-all duration-150',
                    collapsed && 'justify-center',
                    active
                      ? 'bg-white/12 text-white font-semibold'
                      : 'text-white/60 hover:bg-white/5 hover:text-white',
                  )}
                >
                  {active && !collapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r bg-gold-400" />
                  )}
                  <item.icon
                    className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-gold-300' : 'text-white/55')}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span className="ml-auto text-[10px] font-bold bg-gold-500 text-brand-900 px-1.5 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── User + bottom actions ── */}
      <div className="border-t border-white/10 p-2 space-y-0.5">
        {!collapsed && user && (
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl mb-1 bg-white/5">
            <div className="w-8 h-8 rounded-full bg-gold-500 flex items-center justify-center text-brand-900 text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.displayName}</p>
              <p className="text-[10px] text-white/45 truncate">{user.email || 'Demo mode'}</p>
            </div>
          </div>
        )}
        <Link
          href="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={cn(
            'flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] text-white/60 hover:bg-white/5 hover:text-white transition-colors',
            collapsed && 'justify-center',
          )}
        >
          <Settings className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && 'Settings'}
        </Link>
        <button
          onClick={logout}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'flex items-center gap-3 px-2.5 py-2 w-full rounded-xl text-[13px] text-white/60 hover:bg-white/10 hover:text-white transition-colors',
            collapsed && 'justify-center',
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
      </div>

      {/* ── Collapse toggle ── */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-[72px] w-6 h-6 rounded-full border border-sandstone bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors z-20"
      >
        {collapsed
          ? <ChevronRight className="h-3 w-3 text-brand-500" />
          : <ChevronLeft className="h-3 w-3 text-brand-500" />}
      </button>
    </aside>
  );
}
