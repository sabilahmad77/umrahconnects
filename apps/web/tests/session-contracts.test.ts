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
