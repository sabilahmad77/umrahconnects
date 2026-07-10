'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, Save, Edit3, Trash2, Plus, X,
  Calendar, Wallet, Users2, FileCheck2, Hotel, Bus, ListChecks,
  FileText, CreditCard, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useBooking, useUpdateBooking, useUpdateBookingStatus, useAssignGroupToBooking,
  useAssignPackage, useSetBookingPayment, useCancelBooking, useGenerateInvoice,
  useAddPilgrimToBooking, useRemovePilgrimFromBooking,
} from '@/hooks/use-bookings';
import { useGroups, usePackages, usePilgrims } from '@/hooks/use-api';

type TabKey = 'overview' | 'pilgrims' | 'assignments' | 'payment' | 'notes';

const STATUSES = ['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'FULLY_PAID', 'VISA_PROCESSING', 'TRAVELING', 'COMPLETED', 'CANCELLED'];

export function BookingDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: b, isLoading, error, refetch } = useBooking(id);
  const [tab, setTab] = useState<TabKey>('overview');
  const cancel = useCancelBooking();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading booking…
      </div>
    );
  }
  if (error || !b) {
    return (
      <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
        <p className="text-sm text-red-500">Booking not found</p>
        <Link href="/bookings" className="text-xs text-brand-500 hover:underline mt-3 inline-block">← Back to bookings</Link>
      </div>
    );
  }

  const outstanding = (b.totalAmountCents ?? 0) - (b.paidAmountCents ?? 0);

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/bookings')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </button>
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center">
          <CreditCard className="h-6 w-6 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{b.bookingRef}</h1>
          <p className="text-sm text-gray-500">
            {b.package?.name ?? '—'} · {b.pilgrims?.length ?? 0} pilgrim{(b.pilgrims?.length ?? 0) === 1 ? '' : 's'} · {b.currency} {(b.totalAmountCents / 100).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={b.status} />
        {b.status !== 'CANCELLED' && (
          <button
            onClick={async () => {
              const reason = prompt('Cancellation reason (optional)?');
              if (reason === null) return;
              try {
                await cancel.mutateAsync({ id: b.id, reason: reason || undefined });
                toast.success('Booking cancelled');
                refetch();
              } catch (e: any) {
                toast.error(e?.response?.data?.error?.message ?? 'Failed');
              }
            }}
            className="px-3 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-xl"
          >
            Cancel booking
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex gap-1 overflow-x-auto">
        {(['overview', 'pilgrims', 'assignments', 'payment', 'notes'] as TabKey[]).map((t) => (
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

      {tab === 'overview' && <Overview b={b} outstanding={outstanding} />}
      {tab === 'pilgrims' && <PilgrimsTab b={b} refetch={refetch} />}
      {tab === 'assignments' && <AssignmentsTab b={b} refetch={refetch} />}
      {tab === 'payment' && <PaymentTab b={b} outstanding={outstanding} refetch={refetch} />}
      {tab === 'notes' && <NotesTab b={b} refetch={refetch} />}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'FULLY_PAID' || status === 'COMPLETED' ? 'bg-green-50 text-green-700' :
    status === 'CONFIRMED' || status === 'TRAVELING' ? 'bg-blue-50 text-blue-700' :
    status === 'PARTIALLY_PAID' || status === 'VISA_PROCESSING' ? 'bg-yellow-50 text-yellow-700' :
    status === 'CANCELLED' ? 'bg-red-50 text-red-600' :
    'bg-gray-100 text-gray-600';
  return <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full', color)}>{status?.replace(/_/g, ' ')}</span>;
}

function Overview({ b, outstanding }: { b: any; outstanding: number }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><ListChecks className="h-4 w-4" /> Booking details</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Reference" value={b.bookingRef} />
          <Field label="Status" value={b.status?.replace(/_/g, ' ')} />
          <Field label="Package" value={b.package?.name ?? '—'} />
          <Field label="Trip type" value={b.package?.tripType ?? '—'} />
          <Field label="Departure" value={b.departureDate ? new Date(b.departureDate).toLocaleDateString() : '—'} />
          <Field label="Return" value={b.returnDate ? new Date(b.returnDate).toLocaleDateString() : '—'} />
          <Field label="Group" value={b.groupId ? <Link href={`/groups/${b.groupId}`} className="text-brand-600 hover:underline">View group</Link> : '—'} />
          <Field label="Created" value={b.createdAt ? new Date(b.createdAt).toLocaleString() : '—'} />
        </dl>
        {b.notes && (
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{b.notes}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2 inline-flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Totals</p>
          <p className="text-2xl font-bold text-gray-900">{b.currency} {(b.totalAmountCents / 100).toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total amount</p>
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-50">
            <div>
              <p className="text-base font-semibold text-green-600">{(b.paidAmountCents / 100).toLocaleString()}</p>
              <p className="text-[11px] text-gray-500">Paid</p>
            </div>
            <div>
              <p className="text-base font-semibold text-orange-600">{(outstanding / 100).toLocaleString()}</p>
              <p className="text-[11px] text-gray-500">Outstanding</p>
            </div>
          </div>
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

function PilgrimsTab({ b, refetch }: { b: any; refetch: () => void }) {
  const { data: pilgrimsData } = usePilgrims({ limit: 100 });
  const add = useAddPilgrimToBooking();
  const remove = useRemovePilgrimFromBooking();
  const [selectedId, setSelectedId] = useState('');
  const pilgrimsList = pilgrimsData?.items ?? [];
  const inBooking = new Set((b.pilgrims ?? []).map((p: any) => p.pilgrimId));
  const available = pilgrimsList.filter((p: any) => !inBooking.has(p.id));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2"><Users2 className="h-4 w-4" /> Attach pilgrim</h3>
        <div className="flex gap-2">
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="flex-1 text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
            <option value="">Select pilgrim…</option>
            {available.map((p: any) => (
              <option key={p.id} value={p.id}>{[p.firstNameEn, p.lastNameEn].filter(Boolean).join(' ') || p.firstNameAr || p.id.slice(0, 8)} — {p.passportNumber ?? '—'}</option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (!selectedId) return;
              try {
                await add.mutateAsync({ bookingId: b.id, pilgrimId: selectedId });
                toast.success('Pilgrim added');
                setSelectedId('');
                refetch();
              } catch (e: any) {
                toast.error(e?.response?.data?.error?.message ?? 'Failed');
              }
            }}
            disabled={!selectedId || add.isPending}
            className="flex items-center gap-2 px-4 py-2.5 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">Pilgrims in booking ({b.pilgrims?.length ?? 0})</h3>
        </div>
        {(b.pilgrims ?? []).length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">No pilgrims attached yet — add pilgrims so documents and visas can be tracked</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {b.pilgrims.map((bp: any) => {
              const linked = pilgrimsList.find((p: any) => p.id === bp.pilgrimId);
              const name = linked ? ([linked.firstNameEn, linked.lastNameEn].filter(Boolean).join(' ') || linked.firstNameAr || linked.id.slice(0, 8)) : bp.pilgrimId.slice(0, 8);
              return (
                <li key={bp.id} className="p-4 flex items-center justify-between">
                  <Link href={`/pilgrims/${bp.pilgrimId}`} className="flex items-center gap-3 hover:text-brand-600">
                    <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-xs font-bold">
                      {name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{name}</p>
                      <p className="text-[11px] text-gray-500">{linked?.passportNumber ?? '—'}</p>
                    </div>
                  </Link>
                  <button
                    onClick={async () => {
                      if (!confirm('Remove this pilgrim from the booking?')) return;
                      await remove.mutateAsync({ bookingId: b.id, pilgrimId: bp.pilgrimId });
                      toast.success('Removed');
                      refetch();
                    }}
                    className="p-1.5 rounded hover:bg-red-50 text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function AssignmentsTab({ b, refetch }: { b: any; refetch: () => void }) {
  const { data: groupsData } = useGroups({ limit: 50 });
  const { data: pkgs } = usePackages();
  const assignGroup = useAssignGroupToBooking();
  const assignPkg = useAssignPackage();
  const groups = groupsData?.items ?? [];
  const packages = Array.isArray(pkgs) ? pkgs : ((pkgs as any)?.items ?? []);
  const [groupId, setGroupId] = useState<string>(b.groupId ?? '');
  const [packageId, setPackageId] = useState<string>(b.packageId ?? '');

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Users2 className="h-4 w-4" /> Group</h3>
        <div className="flex gap-2">
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="flex-1 text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
            <option value="">No group</option>
            {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name} ({g.status})</option>)}
          </select>
          <button
            onClick={async () => {
              try {
                await assignGroup.mutateAsync({ id: b.id, groupId: groupId || null });
                toast.success('Group updated');
                refetch();
              } catch (e: any) {
                toast.error(e?.response?.data?.error?.message ?? 'Failed');
              }
            }}
            className="px-4 py-2.5 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
            disabled={assignGroup.isPending}
          >Save</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><FileText className="h-4 w-4" /> Package</h3>
        <div className="flex gap-2">
          <select value={packageId} onChange={(e) => setPackageId(e.target.value)} className="flex-1 text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
            {packages.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.tripType})</option>)}
          </select>
          <button
            onClick={async () => {
              if (!packageId) return;
              try {
                await assignPkg.mutateAsync({ id: b.id, packageId });
                toast.success('Package updated');
                refetch();
              } catch (e: any) {
                toast.error(e?.response?.data?.error?.message ?? 'Failed');
              }
            }}
            className="px-4 py-2.5 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
            disabled={assignPkg.isPending || !packageId}
          >Save</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-2">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Hotel className="h-4 w-4" /> Hotel / Transport / Visa assignment</h3>
        <p className="text-xs text-gray-500">
          Use the global Marketplace Requests workflow to source hotel rooms, transport, or visa support for this booking. Accepted offers convert to bookings automatically.
        </p>
        <div className="flex gap-2 pt-2">
          <Link href="/requests" className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100">Open marketplace requests →</Link>
          <Link href="/transport/assignments" className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 inline-flex items-center gap-1"><Bus className="h-3 w-3" /> Transport assignments</Link>
          <Link href="/compliance" className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 inline-flex items-center gap-1"><FileCheck2 className="h-3 w-3" /> Visa workflow</Link>
        </div>
      </div>
    </div>
  );
}

function PaymentTab({ b, outstanding, refetch }: { b: any; outstanding: number; refetch: () => void }) {
  const router = useRouter();
  const setPayment = useSetBookingPayment();
  const generate = useGenerateInvoice();
  const updateStatus = useUpdateBookingStatus();
  const [paid, setPaid] = useState<string>(String((b.paidAmountCents ?? 0) / 100));
  const [status, setStatus] = useState(b.status);

  const save = async () => {
    try {
      await setPayment.mutateAsync({ id: b.id, paidAmount: Number(paid) || 0, status });
      toast.success('Payment saved');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed');
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Wallet className="h-4 w-4" /> Payment</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Paid amount ({b.currency})</span>
            <input type="number" value={paid} onChange={(e) => setPaid(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
        </div>
        <div className="text-xs text-gray-500 grid grid-cols-3 gap-2 pt-2 border-t border-gray-50">
          <div><span className="text-gray-500">Total:</span> <span className="font-semibold text-gray-900">{b.currency} {(b.totalAmountCents / 100).toLocaleString()}</span></div>
          <div><span className="text-gray-500">Paid:</span> <span className="font-semibold text-green-700">{b.currency} {(b.paidAmountCents / 100).toLocaleString()}</span></div>
          <div><span className="text-gray-500">Outstanding:</span> <span className="font-semibold text-orange-700">{b.currency} {(outstanding / 100).toLocaleString()}</span></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={save} disabled={setPayment.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50">
            {setPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-2 inline-flex items-center gap-2"><FileText className="h-4 w-4" /> Invoice</h3>
        <p className="text-xs text-gray-500 mb-3">Create a finance invoice for this booking. Totals are derived from the booking amount and the lead pilgrim is used as the issued-to party.</p>
        <button
          onClick={async () => {
            try {
              const inv = await generate.mutateAsync(b.id);
              toast.success('Invoice generated');
              if (inv?.id) router.push(`/finance/invoices/${inv.id}`);
            } catch (e: any) {
              toast.error(e?.response?.data?.error?.message ?? 'Failed');
            }
          }}
          disabled={generate.isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50"
        >
          {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Generate invoice
        </button>
      </div>
    </div>
  );
}

function NotesTab({ b, refetch }: { b: any; refetch: () => void }) {
  const update = useUpdateBooking();
  const [notes, setNotes] = useState(b.notes ?? '');
  const [departureDate, setDepartureDate] = useState(b.departureDate?.slice(0, 10) ?? '');
  const [returnDate, setReturnDate] = useState(b.returnDate?.slice(0, 10) ?? '');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 max-w-2xl space-y-3">
      <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Edit3 className="h-4 w-4" /> Operator notes & dates</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Departure</span>
          <input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Return</span>
          <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
        </label>
      </div>
      <label className="block">
        <span className="block text-xs font-semibold text-gray-600 mb-1">Internal notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg resize-none" />
      </label>
      <div className="flex justify-end">
        <button
          onClick={async () => {
            try {
              await update.mutateAsync({ id: b.id, notes, departureDate: departureDate || undefined, returnDate: returnDate || undefined });
              toast.success('Saved');
              refetch();
            } catch (e: any) {
              toast.error(e?.response?.data?.error?.message ?? 'Failed');
            }
          }}
          disabled={update.isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
        >
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
        </button>
      </div>
    </div>
  );
}
