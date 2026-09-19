'use client';

import { Input, Select, Textarea } from '@/components/ui/system';
import { FormField } from '@/components/hotels/hotel-form';

/*
 * Visa application fields shared by "New application" and the Edit tab.
 * Validation mirrors platform/api/src/modules/compliance/dto/compliance.dto.ts.
 * Decision fields (visa number, rejection reason, submission and decision
 * timestamps) are never edited here: the submit / approve / reject actions own them.
 */

// The RegulatorySystem enum (checked against schema.prisma by tests/server-contracts.test.ts).
export const REGULATORY_SYSTEMS = ['NUSUK_MASAR', 'SISKOPATUH', 'NAHCON', 'DIYANET', 'TABUNG_HAJI', 'MOTAC', 'IBA_DGRP', 'MANUAL'];
export const VISA_TYPES = ['UMRAH', 'HAJJ', 'VISIT', 'TRANSIT'];
export const SYSTEM_LABEL: Record<string, string> = {
  NUSUK_MASAR: 'Nusuk / Masar', SISKOPATUH: 'SISKOPATUH', NAHCON: 'NAHCON (Nigeria)', DIYANET: 'Diyanet (Türkiye)',
  TABUNG_HAJI: 'Tabung Haji (Malaysia)', MOTAC: 'MOTAC (Malaysia)', IBA_DGRP: 'IBA / DGRP', MANUAL: 'Manual / other',
};

export interface VisaForm {
  applicantName: string; applicantPassport: string; applicantNationality: string; visaType: string; regulatorySystem: string;
  destinationCountry: string; applicationNumber: string; assignedOfficer: string; expectedCompletionAt: string; price: string; notes: string;
  externalRef: string;
}

export const emptyVisaForm = (): VisaForm => ({
  applicantName: '', applicantPassport: '', applicantNationality: '', visaType: 'UMRAH', regulatorySystem: 'NUSUK_MASAR',
  destinationCountry: 'SA', applicationNumber: '', assignedOfficer: '', expectedCompletionAt: '', price: '', notes: '', externalRef: '',
});

export const visaFormFromVisa = (v: any): VisaForm => ({
  applicantName: v.applicantName ?? '', applicantPassport: v.applicantPassport ?? '', applicantNationality: v.applicantNationality ?? '',
  visaType: v.visaType ?? '', regulatorySystem: v.regulatorySystem ?? 'NUSUK_MASAR', destinationCountry: v.destinationCountry ?? '',
  applicationNumber: v.applicationNumber ?? '', assignedOfficer: v.assignedOfficer ?? '',
  expectedCompletionAt: v.expectedCompletionAt ? String(v.expectedCompletionAt).slice(0, 10) : '',
  price: v.priceCents != null ? String(v.priceCents / 100) : '', notes: v.notes ?? '', externalRef: v.externalRef ?? '',
});

export function visaFormErrors(f: VisaForm, opts: { requireName: boolean }): Record<string, string> {
  const e: Record<string, string> = {};
  if (opts.requireName && !f.applicantName.trim()) e.applicantName = 'Enter the applicant’s name (or link a traveler record).';
  if (f.applicantNationality && !/^[A-Za-z]{2}$/.test(f.applicantNationality)) e.applicantNationality = 'Use the 2-letter country code, for example PK.';
  if (f.destinationCountry && !/^[A-Za-z]{2}$/.test(f.destinationCountry)) e.destinationCountry = 'Use the 2-letter country code.';
  if (f.price && !/^\d+(\.\d{1,2})?$/.test(f.price)) e.price = 'Enter an amount such as 350 or 350.50.';
  return e;
}

export function visaPayload(f: VisaForm, opts: { includeRef: boolean; forUpdate: boolean }) {
  const text = (v: string) => (opts.forUpdate ? v.trim() : v.trim() || undefined);
  const code = (v: string) => (v.trim() ? v.trim().toUpperCase() : opts.forUpdate ? undefined : undefined);
  const body: Record<string, any> = {
    applicantName: text(f.applicantName), applicantPassport: text(f.applicantPassport), applicantNationality: code(f.applicantNationality),
    visaType: f.visaType || undefined, regulatorySystem: f.regulatorySystem, destinationCountry: code(f.destinationCountry),
    assignedOfficer: text(f.assignedOfficer), expectedCompletionAt: f.expectedCompletionAt || (opts.forUpdate ? null : undefined),
    price: f.price ? Number(f.price) : 0, notes: text(f.notes),
  };
  if (opts.forUpdate && f.applicationNumber.trim()) body.applicationNumber = f.applicationNumber.trim();
  if (opts.includeRef) body.externalRef = f.externalRef.trim();
  return body;
}

export function VisaFormFields({ form, setForm, errors, isEdit, canManage }: {
  form: VisaForm; setForm: (u: (f: VisaForm) => VisaForm) => void; errors: Record<string, string>; isEdit: boolean; canManage: boolean;
}) {
  const set = (k: keyof VisaForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FormField label="Applicant name *" error={errors.applicantName} full>{(p) => <Input {...p} value={form.applicantName} onChange={set('applicantName')} />}</FormField>
      <FormField label="Passport number">{(p) => <Input {...p} value={form.applicantPassport} onChange={set('applicantPassport')} placeholder="A1234567" />}</FormField>
      <FormField label="Nationality" error={errors.applicantNationality} hint="2-letter code">{(p) => <Input {...p} maxLength={2} value={form.applicantNationality} onChange={set('applicantNationality')} />}</FormField>
      <FormField label="Visa type">{(p) => (
        <Select {...p} value={form.visaType} onChange={set('visaType')}>
          <option value="">Not chosen yet</option>
          {VISA_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
        </Select>
      )}</FormField>
      <FormField label="Regulatory system">{(p) => (
        <Select {...p} value={form.regulatorySystem} onChange={set('regulatorySystem')}>
          {REGULATORY_SYSTEMS.map((s) => <option key={s} value={s}>{SYSTEM_LABEL[s]}</option>)}
        </Select>
      )}</FormField>
      <FormField label="Destination country" error={errors.destinationCountry} hint="2-letter code">{(p) => <Input {...p} maxLength={2} value={form.destinationCountry} onChange={set('destinationCountry')} />}</FormField>
      <FormField label="Service fee (SAR)" error={errors.price}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={form.price} onChange={set('price')} />}</FormField>
      <FormField label="Assigned officer">{(p) => <Input {...p} value={form.assignedOfficer} onChange={set('assignedOfficer')} />}</FormField>
      <FormField label="Expected completion">{(p) => <Input {...p} type="date" value={form.expectedCompletionAt} onChange={set('expectedCompletionAt')} />}</FormField>
      {isEdit && <FormField label="Application number">{(p) => <Input {...p} value={form.applicationNumber} onChange={set('applicationNumber')} />}</FormField>}
      {isEdit && canManage && <FormField label="Visa number / regulator reference" hint="Correct it here; it is first recorded on approval">{(p) => <Input {...p} value={form.externalRef} onChange={set('externalRef')} />}</FormField>}
      <FormField label="Notes" full>{(p) => <Textarea {...p} rows={2} value={form.notes} onChange={set('notes')} />}</FormField>
    </div>
  );
}
