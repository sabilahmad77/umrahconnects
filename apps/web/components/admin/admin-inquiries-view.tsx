'use client';

import { useEffect, useState, useCallback } from 'react';
import { Mail, Inbox, Handshake, Briefcase, BellRing, LifeBuoy, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/api';

const TYPE_META: Record<string, { label: string; Icon: any }> = {
  CONTACT: { label: 'Contact', Icon: Mail },
  PARTNER: { label: 'Partner', Icon: Handshake },
  CAREERS: { label: 'Careers', Icon: Briefcase },
  NEWSLETTER: { label: 'Newsletter', Icon: BellRing },
  DEMO: { label: 'Demo request', Icon: Inbox },
  SUPPORT: { label: 'Support', Icon: LifeBuoy },
};
const STATUS_TINT: Record<string, string> = {
  NEW: 'bg-brand-50 text-brand-700', IN_REVIEW: 'bg-gold-50 text-gold-700',
  RESOLVED: 'bg-gray-100 text-gray-600', ARCHIVED: 'bg-gray-100 text-gray-400',
};

export function AdminInquiriesView() {
  const [data, setData] = useState<any>({ items: [], total: 0, byType: {}, newCount: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get('/inquiries' + (filter ? `?type=${filter}` : ''))
      .then((r) => setData(r.data?.data ?? { items: [] }))
      .catch(() => setData({ items: [] }))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: string, status: string) => {
    await apiClient.patch(`/inquiries/${id}/status`, { status }).catch(() => undefined);
    load();
  };

  const TABS = ['', 'CONTACT', 'PARTNER', 'CAREERS', 'NEWSLETTER', 'DEMO', 'SUPPORT'];

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gray-900">Website Inquiries</h1>
          <p className="text-sm text-gray-500 mt-0.5">Contact, partner, careers, newsletter, demo &amp; support submissions from the public website.</p>
        </div>
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {Object.entries(TYPE_META).map(([key, { label, Icon }]) => (
          <div key={key} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center mb-2"><Icon className="h-4 w-4 text-brand-600" /></div>
            <p className="text-xl font-bold text-gray-900">{data.byType?.[key] ?? 0}</p>
            <p className="text-[11px] text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t || 'all'} onClick={() => setFilter(t)} className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors ${filter === t ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {t ? TYPE_META[t].label : 'All'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : (data.items ?? []).length === 0 ? (
          <div className="p-12 text-center"><Inbox className="h-8 w-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-400">No submissions yet.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3 font-semibold">Type</th><th className="px-4 py-3 font-semibold">From</th>
              <th className="px-4 py-3 font-semibold">Message</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Actions</th>
            </tr></thead>
            <tbody>
              {data.items.map((it: any) => {
                const m = TYPE_META[it.type] ?? TYPE_META.CONTACT;
                return (
                  <tr key={it.id} className="border-b border-gray-50 hover:bg-ivory/40">
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-700"><m.Icon className="h-3.5 w-3.5 text-brand-500" /> {m.label}</span></td>
                    <td className="px-4 py-3"><p className="font-medium text-gray-900">{it.name || '—'}</p><p className="text-[12px] text-gray-400">{it.email}</p>{it.company && <p className="text-[11px] text-gray-400">{it.company}</p>}</td>
                    <td className="px-4 py-3 max-w-xs"><p className="text-[13px] text-gray-600 truncate">{it.subject ? <span className="font-medium">{it.subject}: </span> : ''}{it.message || <span className="text-gray-300">—</span>}</p></td>
                    <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-1 rounded-full ${STATUS_TINT[it.status] ?? STATUS_TINT.NEW}`}>{it.status}</span></td>
                    <td className="px-4 py-3">
                      <select value={it.status} onChange={(e) => setStatus(it.id, e.target.value)} className="text-[12px] border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-brand-400">
                        {['NEW', 'IN_REVIEW', 'RESOLVED', 'ARCHIVED'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
