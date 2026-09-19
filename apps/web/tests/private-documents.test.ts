import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('../lib/api', () => ({ apiClient: { get: (...args: unknown[]) => get(...args) } }));

import { openBlankTab, openKycDocument, openVisaDocument } from '../lib/private-documents';

function fakeTab() {
  return {
    opener: {} as unknown,
    closed: false,
    close: vi.fn(function (this: any) {
      this.closed = true;
    }),
    location: { replace: vi.fn() },
    document: { title: '', body: { textContent: '' } },
  };
}

describe('opening a private document', () => {
  let tab: ReturnType<typeof fakeTab>;
  let win: { open: ReturnType<typeof vi.fn>; location: { assign: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    tab = fakeTab();
    win = { open: vi.fn(() => tab), location: { assign: vi.fn() } };
    (globalThis as any).window = win;
    get.mockReset();
  });
  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('opens a new tab without noopener (so it gets a handle), cuts the opener, then navigates that tab', async () => {
    get.mockResolvedValue({ data: { data: { url: '/proxy-api/documents/signed/abc' } } });
    await openVisaDocument('doc-1');
    expect(win.open).toHaveBeenCalledWith('', '_blank');
    expect(String(win.open.mock.calls[0][2] ?? '')).not.toContain('noopener');
    expect(tab.opener).toBeNull();
    expect(tab.location.replace).toHaveBeenCalledWith('/proxy-api/documents/signed/abc');
    expect(win.location.assign).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith('/documents/visa/doc-1/url');
  });

  it('opens the tab before the link request, inside the click', async () => {
    let openedBeforeRequest = false;
    get.mockImplementation(async () => {
      openedBeforeRequest = win.open.mock.calls.length === 1;
      return { data: { data: { url: 'https://r2.example/doc?sig=1' } } };
    });
    await openKycDocument('kyc-1', 2);
    expect(openedBeforeRequest).toBe(true);
    expect(get).toHaveBeenCalledWith('/documents/kyc/kyc-1/2/url');
  });

  it('falls back to the current tab when the popup is blocked (the file downloads, the page stays)', async () => {
    win.open.mockReturnValue(null);
    get.mockResolvedValue({ data: { data: { url: '/proxy-api/documents/signed/xyz' } } });
    await openVisaDocument('doc-2', 3);
    expect(get).toHaveBeenCalledWith('/documents/visa/doc-2/url?version=3');
    expect(win.location.assign).toHaveBeenCalledWith('/proxy-api/documents/signed/xyz');
  });

  it('closes the blank tab and reports the server message when the link is refused', async () => {
    get.mockRejectedValue({ response: { status: 404, data: { error: { message: 'Document not found' } } } });
    const onError = vi.fn();
    await openVisaDocument('doc-3', undefined, onError);
    expect(tab.close).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Document not found');
    expect(tab.location.replace).not.toHaveBeenCalled();
  });

  it('mints a fresh link on every click instead of reusing an old (possibly expired) one', async () => {
    get.mockResolvedValueOnce({ data: { data: { url: '/proxy-api/documents/signed/first' } } });
    get.mockResolvedValueOnce({ data: { data: { url: '/proxy-api/documents/signed/second' } } });
    await openVisaDocument('doc-4');
    tab = fakeTab();
    win.open.mockReturnValue(tab);
    await openVisaDocument('doc-4');
    expect(get).toHaveBeenCalledTimes(2);
    expect(tab.location.replace).toHaveBeenCalledWith('/proxy-api/documents/signed/second');
  });

  it('openBlankTab survives a browser that throws on window.open', () => {
    const throwing = { open: () => { throw new Error('blocked'); } } as unknown as Window;
    expect(openBlankTab(throwing)).toBeNull();
  });
});
