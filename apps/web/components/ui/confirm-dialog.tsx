'use client';
import { Button } from '@/components/ui/system';

import { ModalSurface, Input, Textarea, Alert } from './system';
import { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConfirmSpec {
  title: string;
  /** What will actually happen, in plain words — shown above the buttons. */
  body: string;
  cta: string;
  tone?: 'danger' | 'default';
  /** When set, the operator must type this exact text to enable the CTA. */
  typeToConfirm?: string;
  /** When set, a free-text reason is captured and passed to onConfirm. */
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => Promise<unknown> | unknown;
}

/**
 * Confirmation for privileged / hard-to-reverse admin actions. A real dialog
 * rather than window.confirm so it matches the rest of the app and keeps the
 * Phase-5 accessibility guarantees (role="dialog", labelled, keyboard usable).
 */
export function ConfirmDialog({ spec, onClose }: { spec: ConfirmSpec; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const danger = spec.tone === 'danger';
  const blocked =
    (!!spec.typeToConfirm && typed.trim() !== spec.typeToConfirm) ||
    (!!spec.reasonLabel && reason.trim().length < 3);

  const go = async () => {
    if (blocked) return;
    setBusy(true);
    try { setError(''); await spec.onConfirm(reason.trim() || undefined); onClose(); } catch { setError('This action could not be completed. Try again.'); } finally { setBusy(false); }
  };

  return (
    <ModalSurface title={spec.title} onClose={() => { if (!busy) onClose(); }}>
      <div className="bg-white rounded-xl w-full max-w-md p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className={cn('p-2 rounded-xl', danger ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600')}>
              <AlertTriangle className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-bold text-gray-900">{spec.title}</h2>
          </div>
          <Button variant="quiet" type="button" onClick={onClose} disabled={busy} aria-label="Close dialog" className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="h-4 w-4 text-gray-600" />
          </Button>
        </div>

        <p className="text-sm text-gray-600">{spec.body}</p>
        {error && <Alert title={error} />}

        {spec.reasonLabel && (
          <label className="block mt-3">
            <span className="block text-xs font-semibold text-gray-600 mb-1">{spec.reasonLabel} *</span>
            <Textarea
              autoFocus
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}

              placeholder={spec.reasonPlaceholder}
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none resize-none"
            />
          </label>
        )}

        {spec.typeToConfirm && (
          <label className="block mt-3">
            <span className="block text-xs font-semibold text-gray-600 mb-1">
              Type <span className="font-mono text-gray-800">{spec.typeToConfirm}</span> to confirm
            </span>
            <Input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}

              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none"
            />
          </label>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="quiet" type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </Button>
          <Button variant="quiet" type="button"
            onClick={go}
            disabled={busy || blocked}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 shadow-sm',
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-500 hover:bg-brand-600',
            )}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {spec.cta}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
