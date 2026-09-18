'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Google's standard multicolour "G" mark, unmodified (Google Identity branding
 * guidelines: the logo is always the full-colour G on a white or neutral field).
 */
export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48" className={cn('h-5 w-5 shrink-0', className)}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

/**
 * Google's neutral light button: white field, #747775 1px outline, #1F1F1F
 * label, the G at the leading edge, and one of Google's approved labels.
 * Rendered as a link because starting Google sign-in is a full-page navigation.
 */
const googleButtonClass =
  'inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-md border border-[#747775] bg-white px-3 text-sm font-medium text-[#1F1F1F] ' +
  'transition-colors hover:bg-[#F8FAFF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-60';

export function GoogleButton({
  href,
  onClick,
  label = 'Continue with Google',
  busy = false,
}: {
  href?: string;
  onClick?: () => void;
  label?: 'Continue with Google' | 'Sign in with Google' | 'Sign up with Google' | 'Link your Google account';
  busy?: boolean;
}) {
  const content = (
    <>
      {busy ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-[#1F1F1F]" /> : <GoogleMark />}
      <span style={{ fontFamily: 'Roboto, arial, sans-serif' }}>{label}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} className={googleButtonClass} aria-disabled={busy || undefined} onClick={busy ? (e) => e.preventDefault() : undefined}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={googleButtonClass} onClick={onClick} disabled={busy} aria-busy={busy || undefined}>
      {content}
    </button>
  );
}

/** "or" separator between the Google button and the email form. */
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-gray-600" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-gray-200" />
      <span aria-hidden="true">or</span>
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

/** Development only: the API reports its local stub provider, and we say so plainly. */
export function StubGoogleNotice() {
  return (
    <p role="note" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
      Development: this Google button uses a local test provider — stubbed Google, not a real Google login.
    </p>
  );
}
