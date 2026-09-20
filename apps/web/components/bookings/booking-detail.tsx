'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bus,
  CreditCard,
  Edit3,
  FileCheck2,
  FileText,
  Hotel,
  ListChecks,
  Plus,
  Trash2,
  Users2,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useCapabilities } from '@/hooks/use-capabilities';
import {
  useAddPilgrimToBooking,
  useAssignGroupToBooking,
  useAssignPackage,
  useBooking,
  useCancelBooking,
  useGenerateInvoice,
  useRemovePilgrimFromBooking,
  useUpdateBooking,
  useUpdateBookingStatus,
} from '@/hooks/use-bookings';
import { useBookingInvoices } from '@/hooks/use-finance';
import { useGroups, usePackages, usePilgrims } from '@/hooks/use-api';
import {
  Alert,
  Button,
  Dialog,
  Input,
  LoadingState,
  QueryFailure,
  Select,
  Textarea,
} from '@/components/ui/system';
import { formatAmount } from '@/components/finance/money';
import { tablistKeys } from '@/components/ui/tablist';

type TabKey = 'overview' | 'pilgrims' | 'assignments' | 'payment' | 'notes';

/**
 * Mirrors BOOKING_STATUS_TRANSITIONS in the bookings module. PARTIALLY_PAID,
 * FULLY_PAID and REFUNDED follow recorded payments and cancellation has its
 * own action, so none of them is offered as a manual move.
 */
export const BOOKING_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['CONFIRMED'],
  CONFIRMED: ['DRAFT', 'VISA_PROCESSING'],
  PARTIALLY_PAID: ['VISA_PROCESSING'],
  FULLY_PAID: ['VISA_PROCESSING', 'TRAVELING'],
  VISA_PROCESSING: ['TRAVELING'],
  TRAVELING: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

const label = (s?: string) =>
  String(s ?? '—')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

export function BookingDetail({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useCapabilities();
  const { data: b, isLoading, error, refetch } = useBooking(id);
  const [tab, setTab] = useState<TabKey>('overview');
  const [cancelling, setCancelling] = useState(false);

  if (error) return <QueryFailure error={error} onRetry={() => void refetch()} />;
  if (isLoading || !b) return <LoadingState label="Loading booking…" />;

  const canUpdate = can('booking:booking:update');
  const cancellable =
    can('booking:booking:cancel') && !['CANCELLED', 'COMPLETED', 'REFUNDED'].includes(b.status);
  const outstanding = Math.max(0, Number(b.totalAmountCents ?? 0) - Number(b.paidAmountCents ?? 0));

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="quiet"
          aria-label="Back to bookings"
          onClick={() => router.push('/bookings')}
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4 text-gray-600" />
        </Button>
        <div className="bg-brand-50 flex h-12 w-12 items-center justify-center rounded-xl">
          <CreditCard aria-hidden="true" className="text-brand-600 h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 basis-[calc(100%_-_140px)] sm:basis-auto">
          <h1 className="text-2xl font-bold text-gray-900">{b.bookingRef}</h1>
          <p className="text-sm text-gray-600">
            {b.package?.name ?? 'No package'} · {b.pilgrims?.length ?? 0} pilgrim
            {(b.pilgrims?.length ?? 0) === 1 ? '' : 's'} ·{' '}
            {formatAmount(b.totalAmountCents, b.currency)}
          </p>
        </div>
        <StatusBadge status={b.status} />
        {cancellable && (
          <Button variant="danger" onClick={() => setCancelling(true)}>
            Cancel booking
          </Button>
        )}
      </div>

      <div
        role="tablist" {...tablistKeys()}
        aria-label="Booking sections"
        className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5"
      >
        {(['overview', 'pilgrims', 'assignments', 'payment', 'notes'] as TabKey[]).map((t) => (
          <Button
            key={t}
            role="tab"
            aria-selected={tab === t}
            variant="quiet"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-xl px-3 py-2 text-sm font-medium capitalize',
              tab === t
                ? 'border-brand-100 bg-brand-50 text-brand-700 border'
                : 'text-gray-600 hover:bg-gray-50',
            )}
          >
            {t}
          </Button>
        ))}
      </div>

      {tab === 'overview' && <Overview b={b} outstanding={outstanding} />}
      {tab === 'pilgrims' && (
        <PilgrimsTab b={b} canUpdate={canUpdate} refetch={() => void refetch()} />
      )}
      {tab === 'assignments' && (
        <AssignmentsTab b={b} canUpdate={canUpdate} refetch={() => void refetch()} />
      )}
      {tab === 'payment' && (
        <PaymentTab b={b} outstanding={outstanding} refetch={() => void refetch()} />
      )}
      {tab === 'notes' && <NotesTab b={b} canUpdate={canUpdate} refetch={() => void refetch()} />}
      {cancelling && (
        <CancelDialog b={b} onClose={() => setCancelling(false)} onDone={() => void refetch()} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'FULLY_PAID' || status === 'COMPLETED'
      ? 'bg-green-50 text-green-700'
      : status === 'CONFIRMED' || status === 'TRAVELING'
        ? 'bg-blue-50 text-blue-700'
        : status === 'PARTIALLY_PAID' || status === 'VISA_PROCESSING'
          ? 'bg-yellow-50 text-yellow-800'
          : status === 'CANCELLED'
            ? 'bg-red-50 text-red-700'
            : 'bg-gray-100 text-gray-700';
  return (
    <span
      data-testid="booking-status"
      className={cn('rounded-full px-2 py-1 text-xs font-medium', color)}
    >
      {label(status)}
    </span>
  );
}

function CancelDialog({ b, onClose, onDone }: { b: any; onClose: () => void; onDone: () => void }) {
  const cancel = useCancelBooking();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cancel.isPending) return;
    try {
      await cancel.mutateAsync({ id: b.id, reason: reason.trim() || undefined });
      toast.success('Booking cancelled');
      onDone();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'The booking could not be cancelled.'));
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !cancel.isPending && onClose()}
      title={`Cancel ${b.bookingRef}?`}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-700">
          A cancelled booking cannot be reopened.
          {Number(b.paidAmountCents) > 0 &&
            ` ${formatAmount(b.paidAmountCents, b.currency)} has been paid; refund it from the booking's invoice — the booking becomes refunded once all money is returned.`}
        </p>
        <label className="block text-sm font-medium text-gray-700">
          Reason (optional)
          <Textarea
            value={reason}
            maxLength={1000}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1"
          />
        </label>
        {error && <Alert title="Not cancelled">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={cancel.isPending} onClick={onClose}>
            Keep booking
          </Button>
          <Button type="submit" variant="danger" busy={cancel.isPending}>
            Cancel booking
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Overview({ b, outstanding }: { b: any; outstanding: number }) {
  const date = (v?: string) => (v ? new Date(v).toLocaleDateString() : '—');
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
          <ListChecks aria-hidden="true" className="h-4 w-4" /> Booking details
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Reference" value={b.bookingRef} />
          <Field label="Status" value={label(b.status)} />
          <Field label="Package" value={b.package?.name ?? '—'} />
          <Field label="Trip type" value={b.package?.tripType ?? '—'} />
          <Field label="Departure" value={date(b.departureDate)} />
          <Field label="Return" value={date(b.returnDate)} />
          <Field
            label="Group"
            value={
              b.groupId ? (
                <Link href={`/groups/${b.groupId}`} className="text-brand-600 hover:underline">
                  View group
                </Link>
              ) : (
                '—'
              )
            }
          />
          <Field
            label="Created"
            value={b.createdAt ? new Date(b.createdAt).toLocaleString() : '—'}
          />
          {b.status === 'CANCELLED' && (
            <Field label="Cancellation reason" value={b.cancellationReason ?? '—'} />
          )}
        </dl>
        {b.notes && (
          <div className="border-t border-gray-100 pt-3">
            <p className="mb-1 text-xs font-semibold text-gray-600">Notes</p>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{b.notes}</p>
          </div>
        )}
      </div>
      <MoneyCard b={b} outstanding={outstanding} />
    </div>
  );
}

function MoneyCard({ b, outstanding }: { b: any; outstanding: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
        <Wallet aria-hidden="true" className="h-3.5 w-3.5" /> Totals (kept by the server)
      </p>
      <p className="text-2xl font-bold text-gray-900">
        {formatAmount(b.totalAmountCents, b.currency)}
      </p>
      <p className="mt-1 text-xs text-gray-600">Total amount</p>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
        <div>
          <p className="text-base font-semibold text-green-800" data-testid="booking-paid">
            {formatAmount(b.paidAmountCents, b.currency)}
          </p>
          <p className="text-xs text-gray-600">Paid</p>
        </div>
        <div>
          <p className="text-base font-semibold text-orange-800">
            {formatAmount(outstanding, b.currency)}
          </p>
          <p className="text-xs text-gray-600">Outstanding</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label: name, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-gray-600">{name}</dt>
      <dd className="text-sm font-medium text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}

function PilgrimsTab({
  b,
  canUpdate,
  refetch,
}: {
  b: any;
  canUpdate: boolean;
  refetch: () => void;
}) {
  const {
    data: pilgrimsData,
    error: pilgrimsError,
    refetch: retryPilgrims,
  } = usePilgrims({ limit: 100 });
  const add = useAddPilgrimToBooking();
  const remove = useRemovePilgrimFromBooking();
  const [selectedId, setSelectedId] = useState('');
  const pilgrimsList = pilgrimsData?.items ?? [];
  const inBooking = new Set((b.pilgrims ?? []).map((p: any) => p.pilgrimId));
  const available = pilgrimsList.filter((p: any) => !inBooking.has(p.id));
  const nameOf = (p: any) =>
    [p.firstNameEn, p.lastNameEn].filter(Boolean).join(' ') || p.firstNameAr || p.id.slice(0, 8);

  if (pilgrimsError)
    return <QueryFailure error={pilgrimsError} onRetry={() => void retryPilgrims()} />;
  return (
    <div className="space-y-4">
      {canUpdate && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-gray-900">
            <Users2 aria-hidden="true" className="h-4 w-4" /> Attach pilgrim
          </h2>
          <div className="flex gap-2">
            <Select
              aria-label="Pilgrim to attach"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="flex-1"
            >
              <option value="">Select pilgrim…</option>
              {available.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {nameOf(p)} — {p.passportNumber ?? 'no passport'}
                </option>
              ))}
            </Select>
            <Button
              disabled={!selectedId}
              busy={add.isPending}
              onClick={async () => {
                try {
                  await add.mutateAsync({ bookingId: b.id, pilgrimId: selectedId });
                  toast.success('Pilgrim added');
                  setSelectedId('');
                  refetch();
                } catch (e) {
                  toast.error(apiErrorMessage(e, 'The pilgrim could not be added.'));
                }
              }}
            >
              <Plus aria-hidden="true" className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-sm font-bold text-gray-900">
            Pilgrims in booking ({b.pilgrims?.length ?? 0})
          </h2>
        </div>
        {(b.pilgrims ?? []).length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-600">
            No pilgrims attached yet — add pilgrims so documents and visas can be tracked.
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {b.pilgrims.map((bp: any) => {
              const linked = pilgrimsList.find((p: any) => p.id === bp.pilgrimId);
              const name = linked ? nameOf(linked) : bp.pilgrimId.slice(0, 8);
              return (
                <li key={bp.id} className="flex items-center justify-between p-4">
                  <Link
                    href={`/pilgrims/${bp.pilgrimId}`}
                    className="hover:text-brand-600 flex items-center gap-3"
                  >
                    <div className="bg-brand-50 text-brand-700 flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold">
                      {name
                        .split(' ')
                        .map((n: string) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{name}</p>
                      <p className="text-xs text-gray-600">{linked?.passportNumber ?? '—'}</p>
                    </div>
                  </Link>
                  {canUpdate && (
                    <Button
                      variant="quiet"
                      busy={remove.isPending}
                      aria-label={`Remove ${name} from the booking`}
                      onClick={async () => {
                        if (!confirm(`Remove ${name} from this booking?`)) return;
                        try {
                          await remove.mutateAsync({ bookingId: b.id, pilgrimId: bp.pilgrimId });
                          toast.success('Removed');
                          refetch();
                        } catch (error) {
                          toast.error(apiErrorMessage(error, 'The pilgrim could not be removed.'));
                        }
                      }}
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5 text-red-700" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function AssignmentsTab({
  b,
  canUpdate,
  refetch,
}: {
  b: any;
  canUpdate: boolean;
  refetch: () => void;
}) {
  const { data: groupsData, error: groupsError, refetch: retryGroups } = useGroups({ limit: 50 });
  const { data: pkgs, error: packagesError, refetch: retryPackages } = usePackages();
  const assignGroup = useAssignGroupToBooking();
  const assignPkg = useAssignPackage();
  const groups = groupsData?.items ?? [];
  const packages = Array.isArray(pkgs) ? pkgs : ((pkgs as any)?.items ?? []);
  const [groupId, setGroupId] = useState<string>(b.groupId ?? '');
  const [packageId, setPackageId] = useState<string>(b.packageId ?? '');

  if (groupsError || packagesError) {
    return (
      <QueryFailure
        error={groupsError || packagesError}
        onRetry={() => {
          void retryGroups();
          void retryPackages();
        }}
      />
    );
  }
  const save = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.success(done);
      refetch();
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The change could not be saved.'));
    }
  };
  return (
    <div className="max-w-2xl space-y-3">
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
          <Users2 aria-hidden="true" className="h-4 w-4" /> Group
        </h2>
        <div className="flex gap-2">
          <Select
            aria-label="Group"
            value={groupId}
            disabled={!canUpdate}
            onChange={(e) => setGroupId(e.target.value)}
            className="flex-1"
          >
            <option value="">No group</option>
            {groups.map((g: any) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.status})
              </option>
            ))}
          </Select>
          {canUpdate && (
            <Button
              busy={assignGroup.isPending}
              onClick={() =>
                save(
                  () => assignGroup.mutateAsync({ id: b.id, groupId: groupId || null }),
                  'Group updated',
                )
              }
            >
              Save
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
          <FileText aria-hidden="true" className="h-4 w-4" /> Package
        </h2>
        <p className="text-xs text-gray-600">
          Changing the package does not change the booking total, which was fixed when the booking
          was made.
        </p>
        <div className="flex gap-2">
          <Select
            aria-label="Package"
            value={packageId}
            disabled={!canUpdate}
            onChange={(e) => setPackageId(e.target.value)}
            className="flex-1"
          >
            {!packageId && <option value="">No package</option>}
            {packages.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.tripType})
              </option>
            ))}
          </Select>
          {canUpdate && (
            <Button
              disabled={!packageId}
              busy={assignPkg.isPending}
              onClick={() =>
                save(() => assignPkg.mutateAsync({ id: b.id, packageId }), 'Package updated')
              }
            >
              Save
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
          <Hotel aria-hidden="true" className="h-4 w-4" /> Hotel, transport and visa
        </h2>
        <p className="text-xs text-gray-600">
          Source hotel rooms, transport or visa support for this booking through the marketplace
          requests workflow.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/requests"
            className="bg-brand-50 text-brand-700 hover:bg-brand-100 rounded-lg px-3 py-1.5 text-xs"
          >
            Marketplace requests →
          </Link>
          <Link
            href="/transport/assignments"
            className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-3 py-1.5 text-xs text-purple-700 hover:bg-purple-100"
          >
            <Bus aria-hidden="true" className="h-3 w-3" /> Transport assignments
          </Link>
          <Link
            href="/compliance"
            className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs text-green-800 hover:bg-green-100"
          >
            <FileCheck2 aria-hidden="true" className="h-3 w-3" /> Visa workflow
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Money on a booking is server-owned: the paid amount follows payments
 * recorded on the booking's invoice (by card or manually), and the paid
 * statuses follow the paid amount. Only lifecycle moves are made here.
 */
function PaymentTab({
  b,
  outstanding,
  refetch,
}: {
  b: any;
  outstanding: number;
  refetch: () => void;
}) {
  const router = useRouter();
  const { can } = useCapabilities();
  const canUpdate = can('booking:booking:update');
  const canInvoice = canUpdate && can('finance:invoice:create');
  const canSeeInvoices = can('finance:invoice:read');
  const invoices = useBookingInvoices(canSeeInvoices ? b.id : undefined);
  const generate = useGenerateInvoice();
  const updateStatus = useUpdateBookingStatus();
  const moves = BOOKING_STATUS_TRANSITIONS[String(b.status)] ?? [];
  const [next, setNext] = useState('');
  const live = (invoices.data?.items ?? []).filter(
    (i: any) => !['VOID', 'CANCELLED'].includes(i.status),
  );

  return (
    <div className="max-w-2xl space-y-4">
      <MoneyCard b={b} outstanding={outstanding} />

      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
          <FileText aria-hidden="true" className="h-4 w-4" /> Invoice and payments
        </h2>
        <p className="text-xs text-gray-600">
          Payments are taken on the booking&apos;s invoice — by card or recorded by hand. The paid
          amount and the paid status of this booking follow automatically.
        </p>
        {canSeeInvoices && invoices.isLoading && <LoadingState label="Loading invoices…" />}
        {live.length > 0 && (
          <ul className="space-y-2">
            {live.map((inv: any) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
              >
                <span>
                  {inv.invoiceRef} · {label(inv.status)} · paid{' '}
                  {formatAmount(inv.paidCents, inv.currency)} of{' '}
                  {formatAmount(inv.totalCents, inv.currency)}
                </span>
                <Link
                  href={`/finance/invoices/${inv.id}`}
                  className="text-brand-600 text-xs font-medium hover:underline"
                >
                  Open invoice →
                </Link>
              </li>
            ))}
          </ul>
        )}
        {canInvoice && live.length === 0 && !['CANCELLED', 'REFUNDED'].includes(b.status) && (
          <Button
            busy={generate.isPending}
            onClick={async () => {
              try {
                const inv = await generate.mutateAsync(b.id);
                toast.success('Draft invoice created from the booking');
                if (inv?.id) router.push(`/finance/invoices/${inv.id}`);
              } catch (e) {
                toast.error(apiErrorMessage(e, 'The invoice could not be created.'));
              }
            }}
          >
            Create invoice from booking
          </Button>
        )}
        {!canInvoice && live.length === 0 && (
          <p className="text-xs text-gray-600">
            Creating an invoice needs invoice rights. Ask a finance manager.
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
          <Edit3 aria-hidden="true" className="h-4 w-4" /> Booking status
        </h2>
        <p className="text-sm text-gray-700">
          Current status: <span className="font-semibold">{label(b.status)}</span>
        </p>
        {canUpdate && moves.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label="Next status"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-56"
            >
              <option value="">Move to…</option>
              {moves.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </Select>
            <Button
              disabled={!next}
              busy={updateStatus.isPending}
              onClick={async () => {
                try {
                  await updateStatus.mutateAsync({ id: b.id, status: next });
                  toast.success(`Booking moved to ${label(next).toLowerCase()}`);
                  setNext('');
                  refetch();
                } catch (e) {
                  toast.error(apiErrorMessage(e, 'The status could not be changed.'));
                }
              }}
            >
              Update status
            </Button>
          </div>
        ) : (
          <p className="text-xs text-gray-600">
            {canUpdate
              ? 'No further manual moves from this status.'
              : 'Your account cannot change bookings.'}
          </p>
        )}
      </div>
    </div>
  );
}

function NotesTab({ b, canUpdate, refetch }: { b: any; canUpdate: boolean; refetch: () => void }) {
  const update = useUpdateBooking();
  const [notes, setNotes] = useState(b.notes ?? '');
  const [departureDate, setDepartureDate] = useState(b.departureDate?.slice(0, 10) ?? '');
  const [returnDate, setReturnDate] = useState(b.returnDate?.slice(0, 10) ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (update.isPending) return;
    if (departureDate && returnDate && returnDate < departureDate)
      return setError('The return date cannot be before the departure date.');
    setError(null);
    try {
      await update.mutateAsync({
        id: b.id,
        notes,
        departureDate: departureDate || undefined,
        returnDate: returnDate || undefined,
      });
      toast.success('Saved');
      refetch();
    } catch (err) {
      setError(apiErrorMessage(err, 'The changes could not be saved.'));
    }
  };

  return (
    <form
      onSubmit={save}
      className="max-w-2xl space-y-3 rounded-xl border border-gray-200 bg-white p-5"
    >
      <h2 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
        <Edit3 aria-hidden="true" className="h-4 w-4" /> Operator notes and dates
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Departure</span>
          <Input
            type="date"
            value={departureDate}
            disabled={!canUpdate}
            onChange={(e) => setDepartureDate(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Return</span>
          <Input
            type="date"
            value={returnDate}
            min={departureDate || undefined}
            disabled={!canUpdate}
            onChange={(e) => setReturnDate(e.target.value)}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-gray-600">Internal notes</span>
        <Textarea
          value={notes}
          maxLength={5000}
          disabled={!canUpdate}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {canUpdate && (
        <div className="flex justify-end">
          <Button type="submit" busy={update.isPending}>
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}
