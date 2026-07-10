'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, AlertCircle, UserCircle2, Save, Edit3, Trash2, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useDriver, useUpdateDriver, useDeleteDriver } from '@/hooks/use-transport';

const DRIVER_STATUSES = ['AVAILABLE', 'ASSIGNED', 'ON_TRIP', 'OFF_DUTY', 'INACTIVE'];

export function DriverDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: d, isLoading, error, refetch } = useDriver(id);
  const [tab, setTab] = useState<'overview' | 'edit'>('overview');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading driver…
      </div>
    );
  }
  if (error || !d) {
    return (
      <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
        <p className="text-sm text-red-500">Driver not found</p>
        <Link href="/transport" className="text-xs text-brand-500 hover:underline mt-3 inline-block">← Back to transport</Link>
      </div>
    );
  }

  const fullName = `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim();

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/transport')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </button>
        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700 font-bold">
          {(fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{fullName}</h1>
          <p className="text-sm text-gray-500">{d.phone ?? '—'} {d.email && `· ${d.email}`}</p>
        </div>
        <StatusBadge status={d.status} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex gap-1 overflow-x-auto">
        {(['overview', 'edit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'capitalize px-3 py-2 rounded-xl text-sm font-medium transition-colors',
              tab === t ? 'bg-brand-50 text-brand-700 border border-brand-100' : 'text-gray-500 hover:bg-gray-50',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview d={d} />}
      {tab === 'edit' && <EditTab d={d} refetch={refetch} />}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'AVAILABLE' ? 'bg-green-50 text-green-700' :
    status === 'ASSIGNED' ? 'bg-blue-50 text-blue-700' :
    status === 'ON_TRIP' ? 'bg-orange-50 text-orange-700' :
    status === 'OFF_DUTY' ? 'bg-gray-100 text-gray-500' :
    'bg-red-50 text-red-700';
  return <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full', color)}>{status?.replace(/_/g, ' ')}</span>;
}

function Overview({ d }: { d: any }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><ListChecks className="h-4 w-4" /> Driver details</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Phone" value={d.phone} />
          <Field label="Email" value={d.email ?? '—'} />
          <Field label="Nationality" value={d.nationality ?? '—'} />
          <Field label="ID / Passport #" value={d.idNumber ?? '—'} />
          <Field label="License #" value={d.licenseNumber ?? '—'} />
          <Field label="License expiry" value={d.licenseExpiry ? new Date(d.licenseExpiry).toLocaleDateString() : '—'} />
          <Field label="Languages" value={(d.languages ?? []).join(', ') || '—'} />
          <Field label="Rating" value={d.rating ?? '—'} />
        </dl>
        {d.notes && (
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{d.notes}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2">Assigned vehicles</p>
          {(d.vehicles ?? []).length === 0 ? (
            <p className="text-xs text-gray-500">No vehicles assigned</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {d.vehicles.map((vd: any) => (
                <li key={vd.vehicleId}>
                  <Link href={`/transport/vehicles/${vd.vehicleId}`} className="font-medium text-gray-800 hover:underline">
                    {vd.vehicle?.plateNumber ?? vd.vehicleId.slice(0, 8)}
                  </Link>
                  {vd.isPrimary && <span className="ml-1 text-[10px] text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">PRIMARY</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2">Recent assignments</p>
          {(d.assignments ?? []).length === 0 ? (
            <p className="text-xs text-gray-500">No assignments for this driver yet — create one from Transport → Assignments</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {d.assignments.slice(0, 5).map((a: any) => (
                <li key={a.id}>
                  <p className="font-medium text-gray-800">{a.route?.name ?? a.customerName ?? '—'}</p>
                  <p className="text-[11px] text-gray-500">{new Date(a.scheduledAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 font-medium">{value ?? '—'}</dd>
    </div>
  );
}

function EditTab({ d, refetch }: { d: any; refetch: () => void }) {
  const router = useRouter();
  const update = useUpdateDriver();
  const remove = useDeleteDriver();
  const [form, setForm] = useState({
    firstName: d.firstName ?? '',
    lastName: d.lastName ?? '',
    phone: d.phone ?? '',
    email: d.email ?? '',
    nationality: d.nationality ?? '',
    idNumber: d.idNumber ?? '',
    licenseNumber: d.licenseNumber ?? '',
    licenseExpiry: d.licenseExpiry?.slice(0, 10) ?? '',
    languages: (d.languages ?? []).join(', '),
    status: d.status ?? 'AVAILABLE',
    notes: d.notes ?? '',
  });

  const save = async () => {
    try {
      await update.mutateAsync({
        id: d.id,
        ...form,
        languages: form.languages.split(',').map((s: string) => s.trim()).filter(Boolean),
        licenseExpiry: form.licenseExpiry || null,
      });
      toast.success('Driver saved');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed');
    }
  };

  const archive = async () => {
    if (!confirm('Archive this driver?')) return;
    await remove.mutateAsync(d.id);
    toast.success('Driver archived');
    router.push('/transport');
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Edit3 className="h-4 w-4" /> Edit driver</h3>
        <div className="grid grid-cols-2 gap-3">
          <Input label="First name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
          <Input label="Last name" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
          <Input label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Input label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Input label="Nationality (ISO-2)" value={form.nationality} onChange={(v) => setForm({ ...form, nationality: v.toUpperCase().slice(0, 2) })} />
          <Input label="ID / passport #" value={form.idNumber} onChange={(v) => setForm({ ...form, idNumber: v })} />
          <Input label="License #" value={form.licenseNumber} onChange={(v) => setForm({ ...form, licenseNumber: v })} />
          <Input label="License expiry" type="date" value={form.licenseExpiry} onChange={(v) => setForm({ ...form, licenseExpiry: v })} />
          <Input label="Languages (comma)" value={form.languages} onChange={(v) => setForm({ ...form, languages: v })} full />
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Status</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {DRIVER_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label className="block col-span-2">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Notes</span>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg resize-none" />
          </label>
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={save} disabled={update.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save driver
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-red-100 p-5">
        <h3 className="text-sm font-bold text-red-700 inline-flex items-center gap-2"><Trash2 className="h-4 w-4" /> Archive driver</h3>
        <p className="text-xs text-gray-500 my-2">Hides the driver from active roster.</p>
        <button onClick={archive} className="px-4 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg">Archive</button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, full, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; full?: boolean; type?: string }) {
  return (
    <label className={cn('block', full && 'col-span-2')}>
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
    </label>
  );
}
