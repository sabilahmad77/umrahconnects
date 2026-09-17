'use client';
import { FieldInput as PlanInput } from '@/components/ui/system';
import { Input, Select, ModalSurface, Textarea , Button , QueryFailure } from '@/components/ui/system';


import { useState } from 'react';
import {
  ClipboardList, Plus, RefreshCw, AlertCircle, Loader2, X, Search, Wallet,
  Hotel, Bus, FileCheck2, Package, Percent, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useBudgetPlans, useCreateBudgetPlan, useUpdateBudgetPlan, useDeleteBudgetPlan } from '@/hooks/use-finance';

const PLAN_STATUSES = ['DRAFT', 'PROPOSED', 'ACCEPTED', 'COMPLETED', 'CANCELLED'];

const fmt = (cents: number, cur = 'SAR') => `${cur} ${((cents ?? 0) / 100).toLocaleString()}`;

export function BudgetPlansView() {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useBudgetPlans(statusFilter !== 'ALL' ? { status: statusFilter } : undefined);
  const update = useUpdateBudgetPlan();
  const del = useDeleteBudgetPlan();

  const items = (data?.items ?? []).filter((p: any) =>
    !search || (p.clientName ?? '').toLowerCase().includes(search.toLowerCase()) || (p.destination ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  if (error) return <QueryFailure error={error} onRetry={() => { refetch(); }} />;
  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budget plans</h1>
          <p className="text-sm text-gray-600 mt-0.5">{data?.total ?? 0} client budget plans — hotel, transport, visa &amp; package allocation</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" type="button" aria-label="Refresh information" onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
          <Button variant="quiet" type="button" onClick={() => setShowCreate(true)} className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 shadow-sm">
            <Plus className="h-4 w-4" /> New budget plan
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72">
          <Search className="h-4 w-4 text-gray-600" />
          <Input aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client / destination…" className="text-sm bg-transparent flex-1 outline-none" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['ALL', ...PLAN_STATUSES].map((s) => (
            <Button variant="quiet" type="button"
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn('text-xs px-3 py-1.5 rounded-full border font-medium transition-all',
                statusFilter === s ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-600">No budget plans yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((p: any) => {
            const allocated = p.hotelBudgetCents + p.transportBudgetCents + p.visaBudgetCents + p.packageBudgetCents + p.otherBudgetCents;
            const isOpen = expanded === p.id;
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200">
                <div className="p-4 flex items-center justify-between gap-3">
                  <Button variant="quiet" type="button" onClick={() => setExpanded(isOpen ? null : p.id)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-700 shrink-0">
                      <ClipboardList className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.clientName} <span className="text-xs text-gray-600">· {p.planRef}</span></p>
                      <p className="text-xs text-gray-600 truncate">
                        {p.destination ?? '—'} · {p.travelers} traveler(s) · total {fmt(p.totalBudgetCents, p.currency)}
                      </p>
                    </div>
                  </Button>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select disabled={update.isPending} aria-label={`Status for ${p.id ?? 'record'}`}
                      value={p.status}
                      onChange={async (e) => { try { await update.mutateAsync({ id: p.id, status: e.target.value }); toast.success('Updated'); refetch(); } catch (error) { toast.error((error as any)?.response?.data?.error?.message ?? (error as any)?.response?.data?.message ?? 'This action could not be completed. Try again.'); } }}
                      className={cn('text-xs border rounded-lg px-2 py-1',
                        p.status === 'ACCEPTED' || p.status === 'COMPLETED' ? 'border-green-200 bg-green-50 text-green-700' :
                        p.status === 'PROPOSED' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                        p.status === 'CANCELLED' ? 'border-red-200 bg-red-50 text-red-600' :
                        'border-gray-200 bg-white text-gray-600')}
                    >
                      {PLAN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                    <Button variant="quiet" type="button" onClick={() => setExpanded(isOpen ? null : p.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600">
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Button busy={del.isPending} variant="quiet" type="button" aria-label="Delete record"
                      onClick={async () => { try { if (!confirm('Cancel this budget plan?')) return; await del.mutateAsync(p.id); toast.success('Cancelled'); refetch(); } catch (error) { toast.error((error as any)?.response?.data?.error?.message ?? (error as any)?.response?.data?.message ?? 'This action could not be completed. Try again.'); } }}
                      className="p-1.5 rounded hover:bg-red-50 text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-50 pt-3">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                      <BudgetCell label="Hotel" value={fmt(p.hotelBudgetCents, p.currency)} icon={Hotel} />
                      <BudgetCell label="Transport" value={fmt(p.transportBudgetCents, p.currency)} icon={Bus} />
                      <BudgetCell label="Visa" value={fmt(p.visaBudgetCents, p.currency)} icon={FileCheck2} />
                      <BudgetCell label="Package" value={fmt(p.packageBudgetCents, p.currency)} icon={Package} />
                      <BudgetCell label="Commission" value={fmt(p.commissionCents, p.currency)} icon={Percent} />
                    </div>
                    <div className="text-xs text-gray-600 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-50">
                      <span><span className="text-gray-600">Total budget:</span> <span className="font-semibold text-gray-900">{fmt(p.totalBudgetCents, p.currency)}</span></span>
                      <span><span className="text-gray-600">Allocated:</span> <span className="font-semibold text-gray-900">{fmt(allocated, p.currency)}</span></span>
                      <span><span className="text-gray-600">Remaining:</span> <span className={cn('font-semibold', p.totalBudgetCents - allocated < 0 ? 'text-red-600' : 'text-green-700')}>{fmt(p.totalBudgetCents - allocated, p.currency)}</span></span>
                      <span><span className="text-gray-600">Client type:</span> <span className="font-semibold text-gray-900">{p.clientType}</span></span>
                    </div>
                    {(p.dateFrom || p.dateTo) && (
                      <p className="text-xs text-gray-600 mt-2">
                        {p.dateFrom ? new Date(p.dateFrom).toLocaleDateString() : '?'} → {p.dateTo ? new Date(p.dateTo).toLocaleDateString() : '?'}
                      </p>
                    )}
                    {p.notes && <p className="text-xs text-gray-600 mt-2">{p.notes}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateBudgetPlanModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refetch(); }} />
      )}
    </div>
  );
}

function BudgetCell({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <p className="text-xs text-gray-600 inline-flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}



function CreateBudgetPlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const create = useCreateBudgetPlan();
  const [f, setF] = useState({
    clientName: '', clientType: 'TRAVELER', destination: '', dateFrom: '', dateTo: '',
    travelers: '1', currency: 'SAR', totalBudget: '', hotelBudget: '', transportBudget: '',
    visaBudget: '', packageBudget: '', otherBudget: '', commissionRate: '', status: 'DRAFT', notes: '',
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const allocated = ['hotelBudget', 'transportBudget', 'visaBudget', 'packageBudget', 'otherBudget']
    .reduce((s, k) => s + (Number((f as any)[k]) || 0), 0);

  const submit = async () => {
    if (!f.clientName.trim()) { toast.error('Client name is required'); return; }
    try {
      await create.mutateAsync({
        clientName: f.clientName.trim(),
        clientType: f.clientType,
        destination: f.destination || undefined,
        dateFrom: f.dateFrom || undefined,
        dateTo: f.dateTo || undefined,
        travelers: Number(f.travelers) || 1,
        currency: f.currency,
        totalBudget: f.totalBudget ? Number(f.totalBudget) : undefined,
        hotelBudget: Number(f.hotelBudget) || 0,
        transportBudget: Number(f.transportBudget) || 0,
        visaBudget: Number(f.visaBudget) || 0,
        packageBudget: Number(f.packageBudget) || 0,
        otherBudget: Number(f.otherBudget) || 0,
        commissionRate: f.commissionRate ? Number(f.commissionRate) : undefined,
        status: f.status,
        notes: f.notes || undefined,
      });
      toast.success('Budget plan created');
      onCreated();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed');
    }
  };

  return (
    <ModalSurface busy={create.isPending} title="New budget plan" onClose={onClose}   >
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">New budget plan</h2>
          <Button disabled={create.isPending} variant="quiet" type="button" aria-label="Close dialog" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PlanInput label="Client name *" value={f.clientName} onChange={(v) => set('clientName', v)} placeholder="Ahmed Family" />
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Client type</span>
            <Select  value={f.clientType} onChange={(e) => set('clientType', e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {['TRAVELER', 'OPERATOR', 'EXTERNAL'].map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </label>
          <PlanInput label="Destination" value={f.destination} onChange={(v) => set('destination', v)} placeholder="Makkah & Madinah" />
          <PlanInput label="Number of travelers" value={f.travelers} onChange={(v) => set('travelers', v)} type="number" />
          <PlanInput label="Travel from" value={f.dateFrom} onChange={(v) => set('dateFrom', v)} type="date" />
          <PlanInput label="Travel to" value={f.dateTo} onChange={(v) => set('dateTo', v)} type="date" />
          <PlanInput label="Total budget" value={f.totalBudget} onChange={(v) => set('totalBudget', v)} type="number" placeholder="auto-sums if blank" />
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Currency</span>
            <Select  value={f.currency} onChange={(e) => set('currency', e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {['SAR', 'USD', 'IDR', 'PKR', 'MYR'].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </label>
          <PlanInput label="Hotel budget" value={f.hotelBudget} onChange={(v) => set('hotelBudget', v)} type="number" />
          <PlanInput label="Transport budget" value={f.transportBudget} onChange={(v) => set('transportBudget', v)} type="number" />
          <PlanInput label="Visa budget" value={f.visaBudget} onChange={(v) => set('visaBudget', v)} type="number" />
          <PlanInput label="Package budget" value={f.packageBudget} onChange={(v) => set('packageBudget', v)} type="number" />
          <PlanInput label="Other budget" value={f.otherBudget} onChange={(v) => set('otherBudget', v)} type="number" />
          <PlanInput label="Commission rate (%)" value={f.commissionRate} onChange={(v) => set('commissionRate', v)} type="number" />
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Status</span>
            <Select  value={f.status} onChange={(e) => set('status', e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {PLAN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </label>
          <label className="block col-span-2">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Notes</span>
            <Textarea  value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg resize-none" />
          </label>
        </div>
        <div className="bg-brand-50 rounded-lg px-3 py-2 text-sm mt-3">
          <span className="text-gray-600">Allocated across categories:</span> <span className="font-bold text-gray-900">{f.currency} {allocated.toLocaleString()}</span>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button disabled={create.isPending} variant="quiet" type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</Button>
          <Button variant="quiet" type="button" onClick={submit} disabled={create.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create plan
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
