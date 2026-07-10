'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Package, Plus, X, Loader2, RefreshCw, Clock, MapPin } from 'lucide-react';
import { usePackages, useCreatePackage } from '@/hooks/use-api';

const TYPES = ['UMRAH', 'HAJJ', 'ZIYARAH', 'CUSTOM'];
const TYPE_TINT: Record<string, string> = {
  UMRAH: 'bg-brand-50 text-brand-700', HAJJ: 'bg-gold-50 text-gold-700',
  ZIYARAH: 'bg-blue-50 text-blue-700', CUSTOM: 'bg-gray-100 text-gray-600',
};
const fmt = (cents?: number) => cents != null ? `SAR ${(cents / 100).toLocaleString()}` : '—';
// packages return priceAdultCents (or basePriceCents); support both
const priceOf = (p: any) => p.priceAdultCents ?? p.basePriceCents ?? (p.priceAdult != null ? p.priceAdult * 100 : undefined);

export function PackagesView() {
  const { data, isLoading, refetch } = usePackages();
  const create = useCreatePackage();
  const [open, setOpen] = useState(false);
  const list: any[] = Array.isArray(data) ? data : (data as any)?.items ?? [];

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gray-900">Packages</h1>
          <p className="text-sm text-gray-500 mt-0.5">Umrah/Hajj packages your agency offers — selectable when creating bookings.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            <Plus className="h-4 w-4" /> New package
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-2xl bg-white border border-gray-100 animate-pulse" />)}</div>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Package className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No packages yet. Create your first package so it can be selected on bookings.</p>
          <button onClick={() => setOpen(true)} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-600"><Plus className="h-4 w-4" /> New package</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center"><Package className="h-5 w-5 text-brand-600" /></div>
                <span className={`text-[10.5px] font-bold px-2 py-1 rounded-full ${TYPE_TINT[p.type] ?? TYPE_TINT.CUSTOM}`}>{p.type ?? 'CUSTOM'}</span>
              </div>
              <p className="font-heading font-bold text-gray-900 mt-3">{p.name}</p>
              <div className="flex items-center gap-3 text-[12px] text-gray-500 mt-1.5">
                {p.durationDays && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {p.durationDays}d</span>}
                {p.departureCity && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {p.departureCity}</span>}
              </div>
              <p className="font-heading font-bold text-brand-600 mt-3">{fmt(priceOf(p))}<span className="text-[11px] text-gray-500 font-normal"> / adult</span></p>
              {p.status && <span className="inline-block mt-2 text-[10px] font-semibold text-gray-500">{p.status}</span>}
            </div>
          ))}
        </div>
      )}

      {open && <PackageModal onClose={() => setOpen(false)} onCreate={async (dto) => {
        try { await create.mutateAsync(dto); toast.success('Package created'); setOpen(false); }
        catch (e: any) { toast.error(e?.response?.data?.error?.message ?? 'Could not create package'); }
      }} pending={create.isPending} />}
    </div>
  );
}

function PackageModal({ onClose, onCreate, pending }: { onClose: () => void; onCreate: (dto: any) => Promise<void>; pending: boolean }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('UMRAH');
  const [priceAdult, setPriceAdult] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [departureCity, setDepartureCity] = useState('');
  const inputCls = 'w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400';

  const submit = () => {
    if (!name.trim()) { toast.error('Package name is required'); return; }
    const price = Number(priceAdult);
    if (!price || price <= 0) { toast.error('Enter a valid adult price'); return; }
    onCreate({
      name: name.trim(), type,
      priceAdult: price,
      durationDays: durationDays ? Number(durationDays) : undefined,
      departureCity: departureCity.trim() || undefined,
    });
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">New package</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">Name *</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Premium 14-Night Umrah" className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls + ' bg-white'}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">Adult price (SAR) *</label>
              <input type="number" min={0} value={priceAdult} onChange={(e) => setPriceAdult(e.target.value)} placeholder="12000" className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">Duration (days)</label>
              <input type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} placeholder="14" className={inputCls} /></div>
            <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">Departure city</label>
              <input value={departureCity} onChange={(e) => setDepartureCity(e.target.value)} placeholder="Jeddah" className={inputCls} /></div>
          </div>
          <button onClick={submit} disabled={pending} className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 mt-1">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create package
          </button>
        </div>
      </div>
    </div>
  );
}
