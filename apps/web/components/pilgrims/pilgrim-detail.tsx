'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, Save, Edit3, Trash2, Plus, X,
  User as UserIcon, FileText, Calendar, Wallet, ListChecks, FileCheck2,
  Phone, Mail, Paperclip, Users2, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUpdatePilgrim, useDeletePilgrim, useBookings } from '@/hooks/use-api';
import {
  usePilgrim, useAddPilgrimDocument, useAssignPilgrimToBooking,
} from '@/hooks/use-pilgrims';

type TabKey = 'overview' | 'documents' | 'bookings' | 'edit';

const DOC_TYPES = ['PASSPORT', 'ID_CARD', 'PHOTO', 'VACCINATION', 'YELLOW_FEVER', 'VISA', 'OTHER'];

export function PilgrimDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: p, isLoading, error, refetch } = usePilgrim(id);
  const [tab, setTab] = useState<TabKey>('overview');
  const remove = useDeletePilgrim();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading pilgrim…
      </div>
    );
  }
  if (error || !p) {
    return (
      <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
        <p className="text-sm text-red-500">Pilgrim not found</p>
        <Link href="/pilgrims" className="text-xs text-brand-500 hover:underline mt-3 inline-block">← Back to pilgrims</Link>
      </div>
    );
  }

  const fullName = [p.firstNameEn, p.lastNameEn].filter(Boolean).join(' ') || p.firstNameAr || '—';

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/pilgrims')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </button>
        <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center text-lg font-bold">
          {fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{fullName}</h1>
          <p className="text-sm text-gray-500">{p.passportNumber ?? '—'} · {p.nationality ?? '—'}</p>
        </div>
        <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full',
          p.status === 'CONFIRMED' || p.status === 'IN_KSA' ? 'bg-green-50 text-green-700' :
          p.status === 'PROSPECT' || p.status === 'LEAD' ? 'bg-blue-50 text-blue-700' :
          p.status === 'CANCELLED' ? 'bg-red-50 text-red-600' :
          'bg-gray-100 text-gray-600',
        )}>{p.status?.replace(/_/g, ' ')}</span>
        <button
          onClick={async () => {
            if (!confirm(`Archive ${fullName}? This is a soft delete and can be restored.`)) return;
            try {
              await remove.mutateAsync(p.id);
              toast.success('Pilgrim archived');
              router.push('/pilgrims');
            } catch (e: any) {
              toast.error(e?.response?.data?.error?.message ?? 'Failed');
            }
          }}
          className="px-3 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-xl"
        >
          Archive
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex gap-1 overflow-x-auto">
        {(['overview', 'documents', 'bookings', 'edit'] as TabKey[]).map((t) => (
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

      {tab === 'overview' && <Overview p={p} fullName={fullName} />}
      {tab === 'documents' && <DocumentsTab p={p} refetch={refetch} />}
      {tab === 'bookings' && <BookingsTab p={p} refetch={refetch} />}
      {tab === 'edit' && <EditTab p={p} refetch={refetch} />}
    </div>
  );
}

function Overview({ p, fullName }: { p: any; fullName: string }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><ListChecks className="h-4 w-4" /> Pilgrim details</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Name (EN)" value={[p.firstNameEn, p.lastNameEn].filter(Boolean).join(' ') || '—'} />
          <Field label="Name (AR)" value={[p.firstNameAr, p.lastNameAr].filter(Boolean).join(' ') || '—'} />
          <Field label="Date of birth" value={p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString() : '—'} />
          <Field label="Gender" value={p.gender ?? '—'} />
          <Field label="Nationality" value={p.nationality ?? '—'} />
          <Field label="Phone" value={p.phone ?? '—'} />
          <Field label="Email" value={p.email ?? '—'} />
          <Field label="Passport #" value={p.passportNumber ?? '—'} />
          <Field label="Passport expiry" value={p.passportExpiry ? new Date(p.passportExpiry).toLocaleDateString() : '—'} />
          <Field label="Created" value={p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'} />
        </dl>
        {(p.tags ?? []).length > 0 && (
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {p.tags.map((t: string) => <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{t}</span>)}
            </div>
          </div>
        )}
        {p.notes && (
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.notes}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2 inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Documents</p>
          <p className="text-2xl font-bold text-gray-900">{p.documents?.length ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">on file</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2 inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Bookings</p>
          <p className="text-2xl font-bold text-gray-900">{p.bookings?.length ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">linked</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2 inline-flex items-center gap-1"><FileCheck2 className="h-3.5 w-3.5" /> Visa</p>
          <p className="text-2xl font-bold text-gray-900">{p.visaApplications?.length ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">applications</p>
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

function DocumentsTab({ p, refetch }: { p: any; refetch: () => void }) {
  const add = useAddPilgrimDocument();
  const [form, setForm] = useState({ type: 'PASSPORT', fileUrl: '', fileName: '', expiresAt: '' });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2"><Paperclip className="h-4 w-4" /> Upload document</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Type</span>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">File name</span>
            <input value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" placeholder="passport.pdf" />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Public URL</span>
            <input value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" placeholder="https://…" />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Expires at (optional)</span>
            <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          </label>
        </div>
        <div className="flex justify-end mt-3">
          <button
            onClick={async () => {
              if (!form.fileUrl.trim() || !form.fileName.trim()) { toast.error('File name + URL required'); return; }
              try {
                await add.mutateAsync({
                  pilgrimId: p.id,
                  type: form.type,
                  fileUrl: form.fileUrl.trim(),
                  fileName: form.fileName.trim(),
                  expiresAt: form.expiresAt || undefined,
                });
                toast.success('Document added');
                setForm({ type: 'PASSPORT', fileUrl: '', fileName: '', expiresAt: '' });
                refetch();
              } catch (e: any) {
                toast.error(e?.response?.data?.error?.message ?? 'Failed');
              }
            }}
            disabled={add.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add document
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">Documents ({p.documents?.length ?? 0})</h3>
        </div>
        {(p.documents ?? []).length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">No documents on file</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {p.documents.map((d: any) => (
              <li key={d.id} className="p-4 flex items-center justify-between">
                <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:text-brand-600">
                  <Paperclip className="h-4 w-4 text-brand-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{d.fileName ?? 'document'}</p>
                    <p className="text-[11px] text-gray-500">{d.type} · uploaded {new Date(d.createdAt).toLocaleDateString()}{d.expiresAt && ` · expires ${new Date(d.expiresAt).toLocaleDateString()}`}</p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BookingsTab({ p, refetch }: { p: any; refetch: () => void }) {
  const { data: bookingsData } = useBookings({ limit: 50 });
  const assign = useAssignPilgrimToBooking();
  const bookings = bookingsData?.items ?? [];
  const inBookings = new Set((p.bookings ?? []).map((bp: any) => bp.bookingId));
  const available = bookings.filter((b: any) => !inBookings.has(b.id));
  const [selected, setSelected] = useState('');

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2"><Calendar className="h-4 w-4" /> Attach to booking</h3>
        <div className="flex gap-2">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1 text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
            <option value="">Select booking…</option>
            {available.map((b: any) => (
              <option key={b.id} value={b.id}>{b.bookingRef} — {b.package?.name ?? '—'} ({b.status})</option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (!selected) return;
              try {
                await assign.mutateAsync({ pilgrimId: p.id, bookingId: selected });
                toast.success('Attached to booking');
                setSelected('');
                refetch();
              } catch (e: any) {
                toast.error(e?.response?.data?.error?.message ?? 'Failed');
              }
            }}
            disabled={!selected || assign.isPending}
            className="flex items-center gap-2 px-4 py-2.5 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Attach
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">Linked bookings ({p.bookings?.length ?? 0})</h3>
        </div>
        {(p.bookings ?? []).length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">Not attached to any booking yet</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {p.bookings.map((bp: any) => {
              const booking = bookings.find((b: any) => b.id === bp.bookingId);
              return (
                <li key={bp.id} className="p-4">
                  <Link href={`/bookings/${bp.bookingId}`} className="flex items-center justify-between hover:text-brand-600">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{booking?.bookingRef ?? bp.bookingId.slice(0, 8)}</p>
                      <p className="text-[11px] text-gray-500">{booking?.package?.name ?? '—'} · {booking?.status ?? ''}</p>
                    </div>
                    {booking?.totalAmountCents != null && (
                      <p className="text-sm font-bold text-gray-900">{booking.currency} {(booking.totalAmountCents / 100).toLocaleString()}</p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function EditTab({ p, refetch }: { p: any; refetch: () => void }) {
  const update = useUpdatePilgrim();
  const [form, setForm] = useState({
    firstName: p.firstNameEn ?? '',
    lastName: p.lastNameEn ?? '',
    firstNameAr: p.firstNameAr ?? '',
    lastNameAr: p.lastNameAr ?? '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    passportNumber: p.passportNumber ?? '',
    passportExpiry: p.passportExpiry?.slice(0, 10) ?? '',
    dateOfBirth: p.dateOfBirth?.slice(0, 10) ?? '',
    notes: p.notes ?? '',
    status: p.status ?? 'PROSPECT',
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 max-w-3xl space-y-3">
      <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Edit3 className="h-4 w-4" /> Edit pilgrim</h3>
      <div className="grid grid-cols-2 gap-3">
        <Input label="First name (EN)" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
        <Input label="Last name (EN)" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
        <Input label="First name (AR)" value={form.firstNameAr} onChange={(v) => setForm({ ...form, firstNameAr: v })} />
        <Input label="Last name (AR)" value={form.lastNameAr} onChange={(v) => setForm({ ...form, lastNameAr: v })} />
        <Input label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Input label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Input label="Passport #" value={form.passportNumber} onChange={(v) => setForm({ ...form, passportNumber: v })} />
        <Input label="Passport expiry" type="date" value={form.passportExpiry} onChange={(v) => setForm({ ...form, passportExpiry: v })} />
        <Input label="Date of birth" type="date" value={form.dateOfBirth} onChange={(v) => setForm({ ...form, dateOfBirth: v })} />
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Status</span>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
            {['PROSPECT', 'LEAD', 'CONFIRMED', 'DOCUMENTS_COLLECTING', 'VISA_PROCESSING', 'PRE_DEPARTURE', 'IN_KSA', 'COMPLETED', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </label>
        <label className="block col-span-2">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Notes</span>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg resize-none" />
        </label>
      </div>
      <div className="flex justify-end pt-2">
        <button
          onClick={async () => {
            try {
              await update.mutateAsync({
                id: p.id,
                ...form,
                passportExpiry: form.passportExpiry || null,
                dateOfBirth: form.dateOfBirth || null,
              });
              toast.success('Pilgrim saved');
              refetch();
            } catch (e: any) {
              toast.error(e?.response?.data?.error?.message ?? 'Failed');
            }
          }}
          disabled={update.isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
        >
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save pilgrim
        </button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
    </label>
  );
}
