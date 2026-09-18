'use client';

import { useState } from 'react';
import { openKycDocument, openVisaDocument } from '@/lib/private-documents';
import { Button } from './system';

/**
 * Opens a private document through the authorized, short-lived signed-URL
 * contract in lib/private-documents.ts. Pass `kycIndex` for an organization
 * verification document, otherwise `documentId` is a visa document id.
 */
export function DocumentLink({ documentId, name, version, kycIndex }: { documentId: string; name: string; version?: number; kycIndex?: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = async () => {
    setBusy(true);
    setError('');
    try {
      if (kycIndex == null) await openVisaDocument(documentId, version, setError);
      else await openKycDocument(documentId, kycIndex, setError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button variant="quiet" busy={busy} onClick={open} aria-label={`Open ${name}`} className="px-2 text-xs text-brand-700">
        Open
      </Button>
      {error && <span role="alert" className="max-w-xs text-xs text-red-700">{error}</span>}
    </span>
  );
}
