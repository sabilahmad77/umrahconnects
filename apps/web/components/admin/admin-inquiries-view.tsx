'use client';
import { Select , Button } from '@/components/ui/system';


import { useEffect, useState, useCallback } from 'react';
import { Mail, Inbox, Handshake, Briefcase, BellRing, LifeBuoy, RefreshCw } from 'lucide-react';
import { ErrorState } from '@/components/ui/system';
import { apiClient } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { toast } from 'sonner';

const TYPE_META: Record<string, { label: string; Icon: any }> = {
  CONTACT: { label: 'Contact', Icon: Mail },
  PARTNER: { label: 'Partner', Icon: Handshake },
  CAREERS: { label: 'Careers', Icon: Briefcase },
  NEWSLETTER: { label: 'Newsletter', Icon: BellRing },
  DEMO: { label: 'Demo request', Icon: Inbox },
  SUPPORT: { label: 'Support', Icon: LifeBuoy },
};
const STATUS_TINT: Record<string, string> = {
  NEW: 'bg-brand-50 text-brand-700', IN_REVIEW: 'bg-gold-50 text-gold-800',
  RESOLVED: 'bg-gray-100 text-gray-600', ARCHIVED: 'bg-gray-100 text-gray-600',
};

export function AdminInquiriesView() {
  const [data, setData] = useState<any>({ items: [], total: 0, byType: {}, newCount: 0 });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    apiClient.get('/inquiries' + (filter ? `?type=${filter}` : ''))
      .then((r) => setData(r.data?.data ?? { items: [] }))
      .catch((e) => setError(e?.response?.status === 403 ? 'Your account cannot access website inquiries.' : 'Website inquiries could not be loaded.'))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // A failed save is reported on its own; it must not replace the list with a load error.
  const setStatus = async (id: string, status: string) => {
    if (saving) return;
    setSaving(id);
    try {
      await apiClient.patch(`/inquiries/${id}/status`, { status });
      toast.success(`Inquiry marked ${status.replace(/_/g, ' ').toLowerCase()}`);
      load();
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The inquiry status could not be saved. Try again.'));
    } finally {
      setSaving(null);
    }
  };

  const TABS = ['', 'CONTACT', 'PARTNER', 'CAREERS', 'NEWSLETTER', 'DEMO', 'SUPPORT'];

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gray-900">Website Inquiries</h1>
          <p className="text-sm text-gray-600 mt-0.5">Contact, partner, careers, newsletter, demo &amp; support submissions from the public website.</p>
        </div>
        <Button variant="quiet" type="button" aria-label="Refresh information" onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {error && <ErrorState title={error} onRetry={load} />}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {Object.entries(TYPE_META).map(([key, { label, Icon }]) => (
          <div key={key} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center mb-2"><Icon className="h-4 w-4 text-brand-600" /></div>
            <p className="text-xl font-bold text-gray-900">{loading || error ? '—' : data.byType?.[key] ?? 0}</p>
            <p className="text-xs text-gray-600">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <Button variant="quiet" type="button" key={t || 'all'} onClick={() => setFilter(t)} className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors ${filter === t ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {t ? TYPE_META[t].label : 'All'}
          </Button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {error ? <p className="p-8 text-sm text-gray-600">Information unavailable.</p> : loading ? (
          <div className="p-8 text-center text-sm text-gray-600">Loading…</div>
        ) : (data.items ?? []).length === 0 ? (
          <div className="p-12 text-center"><Inbox className="h-8 w-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-600">No submissions yet — public contact and inquiry forms land here.</p></div>
        ) : (
          <div role="region" aria-label="Scrollable records" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-600">
              <th className="px-4 py-3 font-semibold">Type</th><th className="px-4 py-3 font-semibold">From</th>
              <th className="px-4 py-3 font-semibold">Message</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Actions</th>
            </tr></thead>
            <tbody>
              {data.items.map((it: any) => {
                const m = TYPE_META[it.type] ?? TYPE_META.CONTACT;
                return (
                  <tr key={it.id} className="border-b border-gray-50 hover:bg-ivory/40">
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-700"><m.Icon className="h-3.5 w-3.5 text-brand-500" /> {m.label}</span></td>
                    <td className="px-4 py-3"><p className="font-medium text-gray-900">{it.name || '—'}</p><p className="text-[12px] text-gray-600">{it.email}</p>{it.company && <p className="text-xs text-gray-600">{it.company}</p>}</td>
                    <td className="px-4 py-3 max-w-xs"><p className="text-[13px] text-gray-600 truncate">{it.subject ? <span className="font-medium">{it.subject}: </span> : ''}{it.message || <span className="text-gray-300">—</span>}</p></td>
                    <td className="px-4 py-3"><span className={`text-xs font-bold px-2 py-1 rounded-full ${STATUS_TINT[it.status] ?? STATUS_TINT.NEW}`}>{it.status}</span></td>
                    <td className="px-4 py-3">
                      <Select aria-label={`Status for inquiry from ${it.email ?? it.id}`} disabled={saving === it.id} value={it.status} onChange={(e) => setStatus(it.id, e.target.value)} className="text-[12px] border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-brand-400">
                        {['NEW', 'IN_REVIEW', 'RESOLVED', 'ARCHIVED'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
