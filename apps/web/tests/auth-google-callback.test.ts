import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../lib/api';
import {
  classifyExchangeFailure,
  exchangeTicketOnce,
  forgetTicketExchange,
  googleErrorMessage,
  googleLinkUrl,
  googleStartUrl,
  parseCallbackFragment,
  resetTicketExchanges,
  takeCallbackFragment,
} from '../lib/google-sign-in';

const TICKET = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0uVw';

afterEach(() => {
  vi.restoreAllMocks();
  resetTicketExchanges();
});

describe('Google callback fragment', () => {
  it('reads the ticket, a safe returnTo and a known outcome', () => {
    expect(parseCallbackFragment(`#ticket=${TICKET}&returnTo=%2Fmarketplace%3Fq%3D1&outcome=created`)).toEqual({
      ticket: TICKET,
      returnTo: '/marketplace?q=1',
      outcome: 'created',
    });
  });

  it.each(['https://evil.test/x', '//evil.test', '/\\evil.test', '/login', '/auth/callback', 'javascript:alert(1)'])(
    'drops the unsafe destination %s',
    (returnTo) => {
      expect(parseCallbackFragment(`#ticket=${TICKET}&returnTo=${encodeURIComponent(returnTo)}`).returnTo).toBeNull();
    },
  );

  it('rejects malformed tickets and unknown outcomes', () => {
    expect(parseCallbackFragment('#ticket=short').ticket).toBeNull();
    expect(parseCallbackFragment(`#ticket=${TICKET}%3Cscript%3E`).ticket).toBeNull();
    expect(parseCallbackFragment(`#ticket=${TICKET}&outcome=admin`).outcome).toBeNull();
    expect(parseCallbackFragment('')).toEqual({ ticket: null, returnTo: null, outcome: null });
  });

  it('removes the fragment from the address bar before anything else, keeping the router state', () => {
    const replaceState = vi.fn();
    const state = { __NA: true };
    const win = { location: { hash: `#ticket=${TICKET}`, pathname: '/auth/callback', search: '' }, history: { state, replaceState } };
    const fragment = takeCallbackFragment(win as unknown as Window);
    expect(fragment.ticket).toBe(TICKET);
    expect(replaceState).toHaveBeenCalledWith(state, '', '/auth/callback');

    const empty = { location: { hash: '', pathname: '/auth/callback', search: '' }, history: { state, replaceState: vi.fn() } };
    expect(takeCallbackFragment(empty as unknown as Window).ticket).toBeNull();
    expect(empty.history.replaceState).not.toHaveBeenCalled();
  });
});

describe('ticket exchange', () => {
  it('posts a ticket once even when the effect runs twice (React strict mode)', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { accessToken: 'unit-access-token' } } });
    const [first, second] = await Promise.all([exchangeTicketOnce(TICKET), exchangeTicketOnce(TICKET)]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/auth/google/exchange', { ticket: TICKET });
    expect(first).toEqual({ accessToken: 'unit-access-token' });
    expect(second).toBe(first);
  });

  it('can retry after a network failure, which never reached the server', async () => {
    const post = vi.spyOn(apiClient, 'post')
      .mockRejectedValueOnce({ request: {}, message: 'Network Error' })
      .mockResolvedValueOnce({ data: { data: { accessToken: 'after-retry' } } });
    const failure = await exchangeTicketOnce(TICKET).catch((e) => e);
    expect(classifyExchangeFailure(failure)).toBe('network');
    forgetTicketExchange(TICKET);
    expect(await exchangeTicketOnce(TICKET)).toEqual({ accessToken: 'after-retry' });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('classifies failures so a spent ticket asks for a restart, not a retry', () => {
    expect(classifyExchangeFailure({ response: { status: 401, data: { error: { code: 'OAUTH_TICKET_INVALID' } } } })).toBe('expired');
    expect(classifyExchangeFailure({ response: { status: 401, data: { error: { code: 'UNAUTHORIZED' } } } })).toBe('account');
    expect(classifyExchangeFailure({ request: {} })).toBe('network');
    expect(classifyExchangeFailure({ response: { status: 500, data: {} } })).toBe('unknown');
    expect(classifyExchangeFailure(new Error('incomplete'))).toBe('unknown');
  });
});

describe('Google error codes', () => {
  // The codes the API can put in /login?error= — read from the server source so a new code cannot ship unexplained.
  const source = readFileSync(join(__dirname, '..', '..', '..', 'platform', 'api', 'src', 'modules', 'auth', 'google.service.ts'), 'utf8');
  const union = source.match(/export type GoogleErrorCode =([\s\S]*?);/)![1];
  const serverCodes = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

  it('has a specific, friendly message for every server code', () => {
    expect(serverCodes).toContain('google_cancelled');
    expect(serverCodes.length).toBeGreaterThanOrEqual(9);
    for (const code of serverCodes) {
      const message = googleErrorMessage(code);
      expect(message, code).not.toBeNull();
      expect(message!.title.length).toBeGreaterThan(5);
      expect(message!.body).not.toMatch(/google_|undefined|\[object/);
    }
    const bodies = serverCodes.map((code) => googleErrorMessage(code)!.body);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it('shows a cancel as information, not as a failure, in both flows', () => {
    expect(googleErrorMessage('google_cancelled')).toMatchObject({ tone: 'info', title: 'Google sign-in was cancelled' });
    expect(googleErrorMessage('google_cancelled', 'link')).toMatchObject({ tone: 'info', title: 'Linking was cancelled' });
    expect(googleErrorMessage('google_already_linked', 'link')!.tone).toBe('error');
  });

  it('ignores unknown or injected codes', () => {
    expect(googleErrorMessage('<script>')).toBeNull();
    expect(googleErrorMessage('toString')).toBeNull();
    expect(googleErrorMessage(null)).toBeNull();
  });

  it('starts Google sign-in with only a same-site return path', () => {
    expect(googleStartUrl('/marketplace?x=1')).toBe('/proxy-api/auth/google/start?returnTo=%2Fmarketplace%3Fx%3D1');
    expect(googleStartUrl('https://evil.test')).toBe('/proxy-api/auth/google/start');
    expect(googleStartUrl(null)).toBe('/proxy-api/auth/google/start');
    expect(googleLinkUrl('abc/def')).toBe('/proxy-api/auth/google/start?intent=abc%2Fdef');
  });
});
