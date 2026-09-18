import axios from 'axios';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {refreshAccessToken} from '../lib/api';
import {loadSessionUser} from '../lib/session';
import {apiClient} from '../lib/api';
afterEach(()=>vi.restoreAllMocks());
describe('session contract consumption',()=>{
 it('coalesces concurrent cookie-only refresh without sending a stored refresh token',async()=>{
  let resolve!:(value:unknown)=>void;
  const post=vi.spyOn(axios,'post').mockImplementation(()=>new Promise(r=>{resolve=r;}) as any);
  const first=refreshAccessToken();const second=refreshAccessToken();expect(post).toHaveBeenCalledTimes(1);expect(post).toHaveBeenCalledWith('/proxy-api/auth/refresh',{}, {withCredentials:true});resolve({data:{data:{accessToken:'unit-test-access-token'}}});expect(await first).toBe('unit-test-access-token');expect(await second).toBe('unit-test-access-token');
 });
 it('binds workspace permissions to the server profile and refuses incomplete metadata',async()=>{
  vi.spyOn(apiClient,'get').mockResolvedValueOnce({data:{data:{id:'server-user',roles:['HOTEL_MANAGER'],permissions:['hotel:allotment:read'],tenant:{id:'hotel-tenant',name:'Property',type:'VENDOR_HOTEL',status:'ACTIVE'},emailVerified:true,firstName:'Amina',lastName:'Hotel'}}});
  const user=await loadSessionUser();expect(user.roles).toEqual(['HOTEL_MANAGER']);expect(user.dashboardType).toBe('hotel');expect(user.permissions).toEqual(['hotel:allotment:read']);expect(user.displayName).toBe('Amina Hotel');
  vi.spyOn(apiClient,'get').mockResolvedValueOnce({data:{data:{id:'server-user',roles:['HOTEL_MANAGER']}}});await expect(loadSessionUser()).rejects.toThrow('workspace is not ready');
 });
});

describe('session refresh on authenticated account calls', () => {
 it('never refreshes for credential and link endpoints, but does for signed-in account actions', async () => {
  const { isCredentialEndpoint } = await import('../lib/api');
  for (const url of ['/auth/login','/auth/register','/auth/refresh','/auth/logout','/auth/google/exchange','/auth/forgot-password','/auth/reset-password','/auth/verify-email/confirm','/auth/otp/verify']) expect(isCredentialEndpoint(url), url).toBe(true);
  for (const url of ['/auth/me','/auth/change-password','/auth/logout-all','/auth/verify-email/request','/auth/google/link-intent','/users/me/preferences']) expect(isCredentialEndpoint(url), url).toBe(false);
 });
 it('refreshes an expired access token and retries change-password instead of failing it', async () => {
  const store: Record<string,string> = { accessToken: 'expired-access-token' };
  const storage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
  // The shared refresh promise is released on the next macrotask; let an earlier test's refresh settle first.
  await new Promise((r) => setTimeout(r, 5));
  vi.stubGlobal('window', globalThis); vi.stubGlobal('localStorage', storage); vi.stubGlobal('sessionStorage', storage);
  try {
   const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { accessToken: 'fresh-access-token' } } });
   const seen: string[] = [];
   const adapter = async (config: any) => {
    seen.push(String(config.headers.Authorization));
    if (config.headers.Authorization === 'Bearer expired-access-token') return Promise.reject({ config, response: { status: 401, data: { error: { code: 'UNAUTHORIZED', message: 'Session has been revoked' } } } });
    return { data: { success: true, data: { message: 'ok' } }, status: 200, statusText: 'OK', headers: {}, config };
   };
   const res = await apiClient.post("/auth/change-password", { currentPassword: "a", newPassword: "b" }, { adapter });
   expect(res.status).toBe(200);
   expect(refresh).toHaveBeenCalledWith('/proxy-api/auth/refresh', {}, { withCredentials: true });
   expect(seen).toEqual(['Bearer expired-access-token', 'Bearer fresh-access-token']);
  } finally { vi.unstubAllGlobals(); }
 });
 it('explains why the sign-in page is shown', async () => {
  const { signInNotice } = await import('../lib/session');
  const { expiredSessionUrl } = await import('../lib/api');
  expect(signInNotice('password-changed')?.title).toBe('Password changed');
  expect(signInNotice('signed-out-everywhere')?.title).toBe('Signed out everywhere');
  expect(signInNotice('session-expired')?.title).toBe('Your session has ended');
  expect(signInNotice('<img>')).toBeNull();
  expect(signInNotice('constructor')).toBeNull();
  expect(expiredSessionUrl({ pathname: '/settings', search: '?tab=1' })).toBe('/login?reason=session-expired&returnTo=%2Fsettings%3Ftab%3D1');
 });
});
