'use client';

import { useState } from 'react';
import { FileBarChart, RefreshCw, Loader2, AlertCircle, Search, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminAuditLogs } from '@/hooks/use-admin';

export function AdminLogsView() {
  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');
  const { data, isLoading, error, refetch } = useAdminAuditLogs({
    action: action || undefined,
    resource: resource || undefined,
    limit: 200,
  });
  const items = data?.items ?? [];

  const exportCsv = () => {
    const rows = [
      ['Occurred', 'Action', 'Resource', 'ResourceId', 'Actor', 'IP', 'Tenant'],
      ...items.map((l: any) => [
        new Date(l.occurredAt).toLocaleString(), l.action, l.resource,
        l.resourceId ?? '', l.actorEmail ?? '', l.ipAddress ?? '', l.tenantId ?? '',
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? 0} audit log entries — login, role changes, KYC, booking &amp; payment actions, errors</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
          <button onClick={exportCsv} className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 rounded-xl hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value.toUpperCase())}
          placeholder="Filter by action (CREATE / UPDATE / DELETE…)"
          className="text-sm px-3 py-2.5 border border-gray-200 rounded-xl outline-none w-full sm:w-72"
        />
        <input
          value={resource}
          onChange={(e) => setResource(e.target.value)}
          placeholder="Filter by resource (booking, listing, …)"
          className="text-sm px-3 py-2.5 border border-gray-200 rounded-xl outline-none w-full sm:w-72"
        />
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-sm text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-sm text-red-500">Failed to load audit logs</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <FileBarChart className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">No log entries</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left p-3">Occurred</th>
                <th className="text-left p-3">Action</th>
                <th className="text-left p-3">Resource</th>
                <th className="text-left p-3">Resource ID</th>
                <th className="text-left p-3">Actor</th>
                <th className="text-left p-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((l: any) => (
                <tr key={l.id} className="hover:bg-gray-50/60">
                  <td className="p-3 text-xs text-gray-600">{new Date(l.occurredAt).toLocaleString()}</td>
                  <td className="p-3">
                    <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full',
                      l.action === 'CREATE' ? 'bg-green-50 text-green-700' :
                      l.action === 'UPDATE' ? 'bg-blue-50 text-blue-700' :
                      l.action === 'DELETE' ? 'bg-red-50 text-red-600' :
                      'bg-gray-100 text-gray-600')}>{l.action}</span>
                  </td>
                  <td className="p-3 text-xs text-gray-700">{l.namespace}:{l.resource}</td>
                  <td className="p-3 text-xs font-mono text-gray-500">{l.resourceId?.slice(0, 8) ?? '—'}</td>
                  <td className="p-3 text-xs text-gray-600">{l.actorEmail ?? l.actorId?.slice(0, 8) ?? '—'}</td>
                  <td className="p-3 text-[11px] font-mono text-gray-500">{l.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
