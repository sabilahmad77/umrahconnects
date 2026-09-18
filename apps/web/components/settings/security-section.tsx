'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { endLocalSession } from '@/lib/session';
import {
  PASSWORD_HINT,
  changePasswordProblems,
  changePasswordServerErrors,
  type ChangePasswordErrors,
  type ChangePasswordInput,
} from '@/lib/password-policy';
import { Alert, Button, Dialog, Input } from '@/components/ui/system';

function Field({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  error?: string;
  hint?: string;
}) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        type="password"
        autoComplete={autoComplete}
        maxLength={128}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={describedBy}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-gray-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Change password. The server signs out every session afterwards — this one
 * included — so success ends the local session and asks for the new password.
 */
export function ChangePasswordForm() {
  const [values, setValues] = useState<ChangePasswordInput>({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState<ChangePasswordErrors>({});
  const [busy, setBusy] = useState(false);
  const set = (key: keyof ChangePasswordInput) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const problems = changePasswordProblems(values);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      await apiClient.post('/auth/change-password', { currentPassword: values.currentPassword, newPassword: values.newPassword });
      endLocalSession('password-changed');
    } catch (error) {
      setErrors(changePasswordServerErrors(error, apiErrorMessage(error, 'Your password could not be changed. Try again.')));
      setBusy(false);
    }
  };

  return (
    <form method="post" onSubmit={submit} className="max-w-md space-y-4" aria-labelledby="change-password-title" noValidate>
      <h3 id="change-password-title" className="text-base font-semibold">
        Change password
      </h3>
      <Field id="current-password" label="Current password" autoComplete="current-password" value={values.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} />
      <Field id="new-password" label="New password" autoComplete="new-password" value={values.newPassword} onChange={set('newPassword')} error={errors.newPassword} hint={PASSWORD_HINT} />
      <Field id="confirm-password" label="Confirm new password" autoComplete="new-password" value={values.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} />
      <p className="text-xs text-gray-600">Changing your password signs you out everywhere, including this browser. You then sign in with the new password.</p>
      {errors.form && <Alert title="Password not changed">{errors.form}</Alert>}
      <Button type="submit" busy={busy}>
        Change password
      </Button>
    </form>
  );
}

/**
 * Accounts created with Google have no password. Adding one goes through the
 * emailed reset link, so a stolen session alone cannot attach a password.
 */
export function SetPasswordPanel({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');

  const request = async () => {
    setBusy(true);
    setError('');
    setSent('');
    try {
      await apiClient.post('/auth/forgot-password', { email });
      setSent(`We sent a link to ${email}. Open it within 30 minutes to choose a password.`);
    } catch (e) {
      // 503 when email delivery is not configured on this deployment — said plainly.
      setError(apiErrorMessage(e, 'The link could not be sent. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md space-y-3" aria-labelledby="set-password-title">
      <h3 id="set-password-title" className="text-base font-semibold">
        Password
      </h3>
      <p className="text-sm text-gray-700">
        You sign in with Google and have no Umrah Connect password. To add one, we email you a link to choose it.
      </p>
      <Button variant="secondary" busy={busy} onClick={request}>
        Email me a link to set a password
      </Button>
      {sent && (
        <Alert tone="info" title="Check your email">
          {sent}
        </Alert>
      )}
      {error && <Alert title="Link not sent">{error}</Alert>}
    </div>
  );
}

/** Revokes every session of the account (all devices, this one included), then signs out here. */
export function SignOutEverywhere() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/auth/logout-all', {});
      endLocalSession('signed-out-everywhere');
    } catch (e) {
      setError(apiErrorMessage(e, 'Your sessions could not be signed out. Try again.'));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" aria-labelledby="sign-out-everywhere-title">
      <h3 id="sign-out-everywhere-title" className="text-base font-semibold">
        Sign out everywhere
      </h3>
      <p className="text-sm text-gray-700">Ends every session of your account on all devices and browsers, including this one.</p>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Sign out everywhere
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="Sign out of every device?" description="You will need to sign in again on every device, including this one.">
        {error && (
          <div className="mb-4">
            <Alert title="Not signed out">{error}</Alert>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" busy={busy} onClick={confirm}>
            Sign out everywhere
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
