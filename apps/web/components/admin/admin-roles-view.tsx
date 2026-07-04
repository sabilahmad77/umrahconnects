'use client';

import { useState } from 'react';
import { Cog, RefreshCw, Loader2, AlertCircle, Users, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminRoles, useAdminPermissions, useAdminRole } from '@/hooks/use-admin';

export function AdminRolesView() {
  const { data: roles = [], isLoading: rl, refetch } = useAdminRoles();
  const { data: permissions = [], isLoading: pl } = useAdminPermissions();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const { data: role } = useAdminRole(selectedRoleId ?? undefined);

  // Group permissions by namespace
  const byNamespace: Record<string, any[]> = {};
  for (const p of permissions) {
    if (!byNamespace[p.namespace]) byNamespace[p.namespace] = [];
    byNamespace[p.namespace].push(p);
  }

  const rolePermIds = new Set((role?.permissions ?? []).map((rp: any) => rp.permission.id));

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Roles &amp; permissions</h1>
          <p className="text-sm text-gray-500 mt-0.5">{roles.length} roles · {permissions.length} platform permissions</p>
        </div>
        <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
          <RefreshCw className={cn('h-4 w-4', rl && 'animate-spin')} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Roles list */}
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Cog className="h-4 w-4" /> Roles</h3>
          </div>
          {rl ? (
            <div className="py-8 text-center text-sm text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : roles.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No roles defined</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {roles.map((r: any) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedRoleId(r.id)}
                    className={cn(
                      'w-full text-left p-3 hover:bg-gray-50',
                      selectedRoleId === r.id && 'bg-brand-50/60',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                      {r.isSystem && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">SYSTEM</span>}
                    </div>
                    <p className="text-[11px] text-gray-500">{r.description ?? '—'}</p>
                    <div className="flex gap-3 mt-1 text-[11px] text-gray-400">
                      <span className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3" /> {r._count?.permissions ?? 0} perms</span>
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {r._count?.userRoles ?? 0} users</span>
                      {r.tenant && <span className="text-gray-500">· {r.tenant.name}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Role detail / permissions matrix */}
        <div className="bg-white rounded-2xl border border-gray-100 lg:col-span-2">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">
              {role ? `${role.name} permissions` : 'Select a role to view permissions'}
            </h3>
          </div>
          {pl || (!role && selectedRoleId) ? (
            <div className="py-8 text-center text-sm text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : !role ? (
            <div className="py-12 text-center text-sm text-gray-400">No role selected</div>
          ) : (
            <div className="p-4 space-y-3">
              {Object.entries(byNamespace).map(([ns, perms]) => (
                <div key={ns}>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{ns}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {perms.map((p) => {
                      const has = rolePermIds.has(p.id);
                      return (
                        <span
                          key={p.id}
                          title={`${p.namespace}:${p.resource}:${p.action}`}
                          className={cn(
                            'text-[10px] px-2 py-1 rounded-full font-medium',
                            has ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400',
                          )}
                        >
                          {p.resource}:{p.action}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
              {(role.userRoles ?? []).length > 0 && (
                <div className="pt-3 border-t border-gray-50">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Users with this role ({role.userRoles.length})</p>
                  <ul className="space-y-1">
                    {role.userRoles.map((ur: any) => (
                      <li key={ur.user.id} className="text-xs text-gray-700">
                        {ur.user.firstName} {ur.user.lastName} <span className="text-gray-400">— {ur.user.email}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
