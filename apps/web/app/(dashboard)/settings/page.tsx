'use client';

import { useState } from 'react';
import { Settings, User, Bell, Key, Building2, Save, CheckCircle2 } from 'lucide-react';
import { useAuthContext } from '@/components/providers/auth-provider';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'profile',  label: 'Profile',       icon: User },
  { id: 'org',      label: 'Organization',  icon: Building2 },
  { id: 'notifs',   label: 'Notifications', icon: Bell },
  { id: 'api',      label: 'API Keys',      icon: Key },
];

export default function SettingsPage() {
  const { user } = useAuthContext();
  const [tab, setTab] = useState('profile');
  const [saved, setSaved] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account and workspace preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Sidebar */}
        <div className="lg:w-52 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors border-b border-gray-50 last:border-0',
                  tab === t.id
                    ? 'bg-brand-50 text-brand-700 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                <t.icon className="h-4 w-4 shrink-0" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-100 p-6">
          {tab === 'profile' && (
            <div className="space-y-5 max-w-lg">
              <div>
                <h2 className="text-base font-bold text-gray-900">Profile Settings</h2>
                <p className="text-sm text-gray-500 mt-0.5">Update your personal information</p>
              </div>

              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xl font-bold shadow-sm">
                  {(displayName || user?.displayName || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <button className="text-sm font-medium text-brand-600 hover:text-brand-700">Change photo</button>
                  <p className="text-xs text-gray-400 mt-0.5">JPG, PNG up to 2MB</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Display Name</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Role</label>
                  <div className="px-3 py-2.5 text-sm bg-gray-50 rounded-xl border border-gray-200 text-gray-600">
                    {user?.dashboardType ?? 'operator'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'org' && (
            <div className="space-y-5 max-w-lg">
              <div>
                <h2 className="text-base font-bold text-gray-900">Organization</h2>
                <p className="text-sm text-gray-500 mt-0.5">Your workspace details</p>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Organization Name', value: user?.tenantName ?? '—' },
                  { label: 'Workspace Slug',    value: user?.tenantSlug ?? '—' },
                  { label: 'Tenant Type',       value: user?.tenantType ?? '—' },
                  { label: 'Tenant ID',         value: user?.tenantId ?? '—' },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">{f.label}</label>
                    <div className="px-3 py-2.5 text-sm bg-gray-50 rounded-xl border border-gray-200 text-gray-600 font-mono">
                      {f.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'notifs' && (
            <div className="space-y-5 max-w-lg">
              <div>
                <h2 className="text-base font-bold text-gray-900">Notifications</h2>
                <p className="text-sm text-gray-500 mt-0.5">Control which alerts you receive</p>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'New pilgrim bookings',    desc: 'Get notified when a new booking is confirmed', enabled: true },
                  { label: 'Visa status updates',     desc: 'Receive alerts for visa approvals/rejections', enabled: true },
                  { label: 'Payment reminders',       desc: 'Overdue invoice reminders',                   enabled: false },
                  { label: 'Group incidents',         desc: 'Real-time alerts for group incidents',         enabled: true },
                  { label: 'Social mentions',         desc: 'When someone mentions you in the feed',        enabled: false },
                  { label: 'Platform announcements',  desc: 'Important product updates',                   enabled: true },
                ].map((n) => (
                  <div key={n.label} className="flex items-center justify-between p-3.5 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{n.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{n.desc}</p>
                    </div>
                    <div className={cn(
                      'w-10 h-6 rounded-full transition-colors relative cursor-pointer',
                      n.enabled ? 'bg-brand-500' : 'bg-gray-200',
                    )}>
                      <div className={cn(
                        'absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all',
                        n.enabled ? 'left-5' : 'left-1',
                      )} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'api' && (
            <div className="space-y-5 max-w-lg">
              <div>
                <h2 className="text-base font-bold text-gray-900">API Keys</h2>
                <p className="text-sm text-gray-500 mt-0.5">Integrate with external systems</p>
              </div>
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700">
                ⚠️ Keep your API keys secret. Never expose them in client-side code.
              </div>
              <div className="space-y-3">
                {[
                  { name: 'Production Key',    key: 'sk_live_••••••••••••••••••••••••••••••', env: 'Production' },
                  { name: 'Development Key',   key: 'sk_dev_••••••••••••••••••••••••••••••',  env: 'Development' },
                ].map((k) => (
                  <div key={k.name} className="p-4 rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-800">{k.name}</p>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', k.env === 'Production' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')}>
                        {k.env}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg flex-1">{k.key}</code>
                      <button className="text-xs text-brand-500 hover:text-brand-600 font-medium px-2 py-1.5">Copy</button>
                    </div>
                  </div>
                ))}
                <button className="text-sm text-brand-500 hover:text-brand-600 font-medium flex items-center gap-1.5">
                  <Key className="h-4 w-4" /> Generate new key
                </button>
              </div>
            </div>
          )}

          {/* Save button */}
          {(tab === 'profile' || tab === 'notifs') && (
            <div className="mt-6 pt-5 border-t border-gray-100 flex items-center gap-3">
              <button
                onClick={save}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
              >
                {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {saved ? 'Saved!' : 'Save Changes'}
              </button>
              {saved && <p className="text-sm text-green-600 font-medium">Changes saved successfully</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
