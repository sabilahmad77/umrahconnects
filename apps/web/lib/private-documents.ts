import { apiClient } from './api';
import { apiErrorMessage } from './api-error';

/**
 * Opening a stored document.
 *
 * Uploaded files are no longer reachable at a guessable `/uploads/...` path.
 * The record only carries an opaque `private:<key>` reference, and the file
 * itself is fetched through a short-lived signed URL that the server mints
 * after it has checked the caller may see that document. Linking the stored
 * value straight into `href` therefore opens nothing at all.
 *
 * The blank tab is opened *before* the request so the browser still attributes
 * it to the click; opening it after the await is treated as a popup and
 * blocked. If the popup was blocked anyway we navigate the current tab, which
 * is a worse experience but still gets the user their file.
 */
async function openSigned(path: string, onError?: (message: string) => void) {
  const tab = typeof window === 'undefined' ? null : window.open('', '_blank', 'noopener,noreferrer');
  try {
    const { data } = await apiClient.get(path);
    const url = data?.data?.url as string | undefined;
    if (!url) throw new Error('The server did not return a download link');
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (e: any) {
    tab?.close();
    const message = apiErrorMessage(e, 'Could not open this document');
    if (onError) onError(message);
    else throw e;
  }
}

/** Open a visa document — the current file, or a specific historical version. */
export function openVisaDocument(docId: string, version?: number, onError?: (message: string) => void) {
  const query = version === undefined ? '' : `?version=${encodeURIComponent(String(version))}`;
  return openSigned(`/documents/visa/${docId}/url${query}`, onError);
}

/** Open one of an organization's KYC documents by its index in the submission. */
export function openKycDocument(kycId: string, index: number, onError?: (message: string) => void) {
  return openSigned(`/documents/kyc/${kycId}/${index}/url`, onError);
}

/**
 * True when a document record actually has a file behind it. Stored values are
 * `private:<key>` for anything uploaded since documents became private, and a
 * plain path for older rows; both mean "there is a file".
 */
export function hasStoredFile(url?: string | null): boolean {
  return typeof url === 'string' && url.length > 0;
}
