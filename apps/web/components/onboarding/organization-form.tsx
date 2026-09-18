'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Alert, Button, Card, Checkbox, Input, Select } from '@/components/ui/system';
import { useAuthContext } from '@/components/providers/auth-provider';
import { apiClient } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { acceptSession } from '@/lib/session';
import {
  COUNTRY_CODES,
  EMPTY_ORGANIZATION,
  ORGANIZATION_TYPES,
  organizationPayload,
  organizationProblems,
  suggestedSlug,
  type OrganizationField,
  type OrganizationForm as Form,
} from './organization-rules';

const countryName = (() => {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return (code: string) => names.of(code) ?? code;
  } catch {
    return (code: string) => code;
  }
})();

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-gray-800">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-gray-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A verified traveler founds a provider organization. The API creates it in
 * PENDING_KYC, moves this account into it as the organization's administrator
 * and returns a new session, which replaces the current one here.
 */
export function OrganizationForm() {
  const { user, setUser } = useAuthContext();
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY_ORGANIZATION);
  const [touched, setTouched] = useState<Partial<Record<OrganizationField, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<OrganizationField, string>>>({});
  const [error, setError] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  // A ref, not state: two clicks in the same frame both see busy === false.
  const submitting = useRef(false);

  const problems = useMemo(() => organizationProblems(form), [form]);
  const countries = useMemo(
    () => COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const role = ORGANIZATION_TYPES.find((t) => t.value === form.type)?.role;

  const set = (field: OrganizationField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setServerErrors((current) => ({ ...current, [field]: undefined }));
  };
  const problem = (field: OrganizationField) => serverErrors[field] ?? (touched[field] ? problems[field] : undefined);
  const describedBy = (field: OrganizationField, hint?: boolean) =>
    problem(field) ? `org-${field}-error` : hint ? `org-${field}-hint` : undefined;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    setTouched({ type: true, name: true, nameAr: true, country: true, slug: true, email: true, phone: true, licenseNumber: true, website: true });
    if (Object.keys(problems).length) {
      setError('Check the highlighted fields.');
      return;
    }
    if (!understood) {
      setError('Confirm that this account will move into the new organization.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const { data } = await apiClient.post('/onboarding/organization', organizationPayload(form));
      // The API revoked the traveler session and issued one for the new
      // organization; adopt it before anything else talks to the API.
      const next = await acceptSession(data.data.tokens.accessToken);
      setUser(next);
      toast.success(`${data.data.organization.name} was created. Submit its verification documents next.`);
      router.replace('/onboarding');
    } catch (e: any) {
      const status = e?.response?.status;
      const message = apiErrorMessage(e, 'The organization could not be created. Try again.');
      if (status === 409) setServerErrors({ slug: 'This address is already taken. Choose another one.' });
      setError(status === 409 ? 'Choose a different organization address.' : message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold">Register your organization</h2>
      <p className="mt-2 text-sm text-gray-600">
        Agencies, ground-service companies, hotels, transport companies and visa agencies work in their own
        organization workspace. It opens once Umrah Connect has verified the organization’s documents.
      </p>
      <form noValidate onSubmit={submit} className="mt-6 space-y-5" aria-describedby={error ? 'org-form-error' : undefined}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="org-type" label="Organization type" hint={role ? `You will administer it as ${role.toLowerCase()}.` : undefined}>
            <Select id="org-type" value={form.type} onChange={(e) => set('type', e.target.value)} aria-describedby="org-type-hint">
              {ORGANIZATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="org-country" label="Country of registration" error={problem('country')}>
            <Select
              id="org-country"
              value={form.country}
              onChange={(e) => set('country', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, country: true }))}
              aria-invalid={!!problem('country')}
              aria-describedby={describedBy('country')}
            >
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="org-name" label="Organization name" error={problem('name')}>
            <Input
              id="org-name"
              required
              maxLength={255}
              autoComplete="organization"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              aria-invalid={!!problem('name')}
              aria-describedby={describedBy('name')}
            />
          </Field>
          <Field id="org-nameAr" label="Name in Arabic (optional)" error={problem('nameAr')}>
            <Input
              id="org-nameAr"
              dir="rtl"
              lang="ar"
              maxLength={255}
              value={form.nameAr}
              onChange={(e) => set('nameAr', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, nameAr: true }))}
              aria-invalid={!!problem('nameAr')}
              aria-describedby={describedBy('nameAr')}
            />
          </Field>
          <Field
            id="org-slug"
            label="Organization address (optional)"
            hint={`Lowercase letters, digits and hyphens. Left empty, it becomes “${suggestedSlug(form.name)}”.`}
            error={problem('slug')}
          >
            <Input
              id="org-slug"
              maxLength={100}
              autoCapitalize="none"
              spellCheck={false}
              value={form.slug}
              placeholder={suggestedSlug(form.name)}
              onChange={(e) => set('slug', e.target.value.toLowerCase())}
              onBlur={() => setTouched((t) => ({ ...t, slug: true }))}
              aria-invalid={!!problem('slug')}
              aria-describedby={describedBy('slug', true)}
            />
          </Field>
          <Field id="org-licenseNumber" label="Licence or registration number (optional)" error={problem('licenseNumber')}>
            <Input
              id="org-licenseNumber"
              maxLength={100}
              value={form.licenseNumber}
              onChange={(e) => set('licenseNumber', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, licenseNumber: true }))}
              aria-invalid={!!problem('licenseNumber')}
              aria-describedby={describedBy('licenseNumber')}
            />
          </Field>
          <Field
            id="org-email"
            label="Organization email (optional)"
            hint={user?.email ? `Left empty, your account email (${user.email}) is used.` : undefined}
            error={problem('email')}
          >
            <Input
              id="org-email"
              type="email"
              maxLength={255}
              autoComplete="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              aria-invalid={!!problem('email')}
              aria-describedby={describedBy('email', true)}
            />
          </Field>
          <Field id="org-phone" label="Phone (optional)" hint="International format, for example +966501234567." error={problem('phone')}>
            <Input
              id="org-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={16}
              value={form.phone}
              onChange={(e) => set('phone', e.target.value.replace(/[\s()-]/g, ''))}
              onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
              aria-invalid={!!problem('phone')}
              aria-describedby={describedBy('phone', true)}
            />
          </Field>
          <Field id="org-website" label="Website (optional)" error={problem('website')}>
            <Input
              id="org-website"
              type="url"
              inputMode="url"
              maxLength={255}
              placeholder="https://"
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, website: true }))}
              aria-invalid={!!problem('website')}
              aria-describedby={describedBy('website')}
            />
          </Field>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 text-sm text-gray-700">
          <Checkbox checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5" />
          <span>
            I understand that this account moves into the new organization as its administrator and stops being a
            traveler account. The organization’s tools open after Umrah Connect approves its verification.
          </span>
        </label>

        {error && (
          <div id="org-form-error">
            <Alert title="The organization was not created">{error}</Alert>
          </div>
        )}
        <Button type="submit" busy={busy}>
          Create organization
        </Button>
      </form>
    </Card>
  );
}
