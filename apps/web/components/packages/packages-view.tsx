'use client';
import { apiErrorMessage } from '@/lib/api-error';
import { ModalSurface, Input, Select , Button , QueryFailure } from '@/components/ui/system';


import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Package, Plus, X, Loader2, RefreshCw, Clock, Users } from 'lucide-react';
import { usePackages, useCreatePackage } from '@/hooks/use-api';
import { useCapabilities } from '@/hooks/use-capabilities';
import { centsToMajor, formatAmount, parseMajorToCents } from '@/components/finance/money';

const TYPES = ['UMRAH', 'HAJJ', 'ZIYARAH', 'CUSTOM'];
const TYPE_TINT: Record<string, string> = {
  UMRAH: 'bg-brand-50 text-brand-700', HAJJ: 'bg-gold-50 text-gold-800',
  ZIYARAH: 'bg-blue-50 text-blue-700', CUSTOM: 'bg-gray-100 text-gray-600',
};
const fmt = (cents?: number, currency = 'SAR') => (cents != null ? formatAmount(cents, currency) : '—');

export function PackagesView() {
  const { data, isLoading, refetch , error: packagesError} = usePackages();
  const create = useCreatePackage();
  const { can } = useCapabilities();
  const canManage = can('booking:package:manage');
  const [open, setOpen] = useState(false);
  const list: any[] = Array.isArray(data) ? data : (data as any)?.items ?? [];

  if (packagesError) return <QueryFailure error={packagesError} onRetry={() => { refetch(); }} />;
  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gray-900">Packages</h1>
          <p className="text-sm text-gray-600 mt-0.5">Umrah/Hajj packages your agency offers — selectable when creating bookings.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" type="button" aria-label="Refresh information" onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600"><RefreshCw className="h-4 w-4" /></Button>
          {canManage && (
            <Button variant="quiet" type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
              <Plus className="h-4 w-4" /> New package
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-xl bg-white border border-gray-200 animate-pulse" />)}</div>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Package className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">No packages yet.{canManage ? ' Create your first package so it can be selected on bookings.' : ''}</p>
          {canManage && <Button variant="quiet" type="button" onClick={() => setOpen(true)} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-600"><Plus className="h-4 w-4" /> New package</Button>}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center"><Package className="h-5 w-5 text-brand-600" /></div>
                <span className={`text-[10.5px] font-bold px-2 py-1 rounded-full ${TYPE_TINT[p.tripType] ?? TYPE_TINT.CUSTOM}`}>{p.tripType ?? 'CUSTOM'}</span>
              </div>
              <p className="font-heading font-bold text-gray-900 mt-3">{p.name}</p>
              <div className="flex items-center gap-3 text-[12px] text-gray-600 mt-1.5">
                {p.durationDays && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {p.durationDays} days</span>}
                {p.maxCapacity && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> up to {p.maxCapacity}</span>}
              </div>
              <p className="font-heading font-bold text-brand-600 mt-3">{fmt(p.basePriceCents, p.currency)}<span className="text-xs text-gray-600 font-normal"> / adult</span></p>
              <span className="inline-block mt-2 text-xs font-semibold text-gray-600">{p.isPublished ? 'Published' : 'Not published'}</span>
            </div>
          ))}
        </div>
      )}

      {open && canManage && <PackageModal onClose={() => setOpen(false)} onCreate={async (dto) => {
        try { await create.mutateAsync(dto); toast.success('Package created'); setOpen(false); }
        catch (e: any) { toast.error(apiErrorMessage(e, 'Could not create package')); }
      }} pending={create.isPending} />}
    </div>
  );
}

function PackageModal({ onClose, onCreate, pending }: { onClose: () => void; onCreate: (dto: any) => Promise<void>; pending: boolean }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('UMRAH');
  const [priceAdult, setPriceAdult] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [maxCapacity, setMaxCapacity] = useState('');
  const inFlight = useRef(false);
  const inputCls = 'w-full text-sm px-3 py-2.5 border border-gray-500 rounded-lg outline-none focus:border-brand-400';

  const submit = async () => {
    if (inFlight.current || pending) return;
    if (name.trim().length < 2) { toast.error('Enter a package name (at least 2 characters)'); return; }
    const priceCents = parseMajorToCents(priceAdult);
    if (priceCents === null || priceCents <= 0) { toast.error('Enter the adult price as an amount such as 12000 or 12000.50'); return; }
    if (durationDays && !/^\d+$/.test(durationDays)) { toast.error('Enter the duration as whole days'); return; }
    if (maxCapacity && !/^\d+$/.test(maxCapacity)) { toast.error('Enter the capacity as a whole number'); return; }
    inFlight.current = true;
    try {
      await onCreate({
        name: name.trim(), type,
        priceAdult: centsToMajor(priceCents),
        durationDays: durationDays ? Number(durationDays) : undefined,
        maxCapacity: maxCapacity ? Number(maxCapacity) : undefined,
      });
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <ModalSurface title="New package" onClose={onClose}   >
      <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">New package</h2>
          <Button variant="quiet" type="button" aria-label="Close dialog" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-600" /></Button>
        </div>
        <div className="space-y-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Name *</label>
            <Input aria-label="Name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Premium 14-Night Umrah" className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
              <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className={inputCls + ' bg-white'}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Adult price (SAR) *</label>
              <Input aria-label="Price Adult" inputMode="decimal" value={priceAdult} onChange={(e) => setPriceAdult(e.target.value)} placeholder="12000" className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Duration (days)</label>
              <Input aria-label="Duration Days" inputMode="numeric" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} placeholder="14" className={inputCls} /></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Maximum travellers</label>
              <Input aria-label="Maximum travellers" inputMode="numeric" value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} placeholder="40" className={inputCls} /></div>
          </div>
          <Button variant="quiet" type="button" onClick={submit} disabled={pending} className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 mt-1">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create package
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
