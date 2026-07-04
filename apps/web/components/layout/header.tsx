'use client';

import { Bell, Search, ChevronDown, LogOut, Settings, User, HelpCircle } from 'lucide-react';
import { NotificationBell } from './notification-bell';
import { useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/providers/auth-provider';
import { cn } from '@/lib/utils';
import type { DashboardType } from '@/lib/auth';

const ROLE_LABELS: Record<DashboardType, string> = {
  operator:   '🏢 Operator Admin',
  admin:      '⚡ Super Admin',
  hotel:      '🏨 Hotel Owner',
  transport:  '🚌 Transport Manager',
  compliance: '📋 Visa Officer',
  finance:    '💰 Finance Manager',
  pilgrim:    '🧕 Pilgrim',
};

export function Header() {
  const { user, logout } = useAuthContext();
  const [showMenu, setShowMenu] = useState(false);

  const displayName = user?.displayName ?? 'User';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'UC';

  return (
    <header className="flex items-center justify-between h-14 px-5 border-b border-gray-100 bg-white shrink-0">
      {/* Search */}
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 w-72 group focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
        <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <input
          type="text"
          placeholder="Search pilgrims, bookings..."
          className="bg-transparent text-sm flex-1 outline-none placeholder:text-gray-400 text-gray-700"
        />
        <kbd className="hidden sm:flex text-[10px] text-gray-400 border border-gray-200 bg-white rounded px-1.5 py-0.5 font-mono">
          ⌘K
        </kbd>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Help */}
        <button className="p-2 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors">
          <HelpCircle className="h-4 w-4" />
        </button>

        {/* Notifications — real, polling, click-to-mark-read */}
        <NotificationBell />

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200 mx-1" />

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
          >
            {/* Avatar */}
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-gray-800 leading-none">{displayName}</p>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-none">
                {user?.dashboardType ? ROLE_LABELS[user.dashboardType] : 'Umrah Connect'}
              </p>
            </div>
            <ChevronDown className={cn('h-3.5 w-3.5 text-gray-400 transition-transform hidden sm:block', showMenu && 'rotate-180')} />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-2xl shadow-xl z-20 overflow-hidden">
                {/* User info */}
                <div className="px-4 py-3 bg-gradient-to-br from-brand-50 to-white border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{displayName}</p>
                      <p className="text-xs text-gray-400 truncate">{user?.email || 'Demo mode'}</p>
                      {user?.dashboardType && (
                        <p className="text-[10px] text-brand-600 font-medium mt-0.5">
                          {ROLE_LABELS[user.dashboardType]}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="p-1.5">
                  <button
                    onClick={() => { setShowMenu(false); window.location.href = '/settings'; }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    <Settings className="h-4 w-4 text-gray-400" />
                    Account settings
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); window.location.href = '/login'; }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    <User className="h-4 w-4 text-gray-400" />
                    Switch role
                  </button>
                </div>

                <div className="border-t border-gray-100 p-1.5">
                  <button
                    onClick={() => { setShowMenu(false); logout(); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors font-medium"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
