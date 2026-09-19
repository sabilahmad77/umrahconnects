import { apiClient } from './api';
import { apiErrorMessage } from './api-error';

/**
 * Opening a stored document.
 *
 * Uploaded files are not reachable at a guessable `/uploads/...` path. The
 * record only carries an opaque `private:<key>` reference, and the file itself
 * is fetched through a short-lived signed URL that the server mints after it
 * has checked the caller may see that document. A fresh link is minted on
 * every click, so a page left open past the link lifetime (≤ 15 minutes) never
 * holds a dead link: nothing signed is ever put in an `href`.
 */

/**
 * Opens an empty tab synchronously, inside the click, so the browser does not
 * treat it as an unsolicited popup once the link arrives asynchronously.
 *
 * `window.open(url, '_blank', 'noopener')` returns `null` by specification,
 * which is why documents used to replace the current page: the code never had
 * a handle on the tab it opened. So the tab is opened WITHOUT `noopener` and
 * its `opener` is cut immediately afterwards — the same isolation `noopener`
 * gives, but with a handle we can navigate.
 */
export function openBlankTab(win: Window): Window | null {
  let tab: Window | null = null;
  try {
    tab = win.open('', '_blank');
  } catch {
    tab = null;
  }
  if (!tab) return null;
  try {
    tab.opener = null;
  } catch {
    // Some browsers make `opener` read-only on a blank tab; it is still same-origin and harmless.
  }
  try {
    tab.document.title = 'Opening document…';
    tab.document.body.textContent = 'Opening document…';
  } catch {
    // Cosmetic only.
  }
  return tab;
}

async function openSigned(path: string, onError?: (message: string) => void) {
  const win = typeof window === 'undefined' ? null : window;
  const tab = win ? openBlankTab(win) : null;
  try {
    const { data } = await apiClient.get(path);
    const url = data?.data?.url as string | undefined;
    if (!url) throw new Error('The server did not return a download link');
    if (tab && !tab.closed) {
      // replace(): the blank placeholder does not stay in the new tab's history.
      tab.location.replace(url);
    } else if (win) {
      // Popup blocked. The signed URL answers with Content-Disposition: attachment,
      // so navigating this tab downloads the file and the page itself stays put.
      win.location.assign(url);
    }
  } catch (e: any) {
    if (tab && !tab.closed) tab.close();
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
