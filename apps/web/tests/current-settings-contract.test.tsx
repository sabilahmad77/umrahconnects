import React from 'react';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
const contract=vi.hoisted(()=>({data:null as any}));
vi.mock('../hooks/use-admin',()=>({useAdminSettings:()=>({data:contract.data,isLoading:false,error:null,refetch:()=>{}})}));
import {AdminSettingsView} from '../components/admin/admin-settings-view';
describe('platform settings current API contract',()=>{
 it('renders the recorded enforced configuration without requiring the removed policies object',()=>{
  const probes=JSON.parse(readFileSync(new URL('../../../docs/ui-ux/acceptance-evidence/proxy-document-settings-checks.json',import.meta.url),'utf8'));
  contract.data=probes.find((probe:any)=>probe.action==='current platform settings contract').data;
  expect(contract.data.policies).toBeUndefined();const html=renderToStaticMarkup(<AdminSettingsView />);expect(html).toContain('Runtime configuration');expect(html).toContain('read-only');expect(html).toContain('log');expect(html).not.toContain('Default cancellation window');expect(html).not.toContain('cancellationDefaultHours');
 });
});
