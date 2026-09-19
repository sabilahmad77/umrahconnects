'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

/*
 * Organization reports (platform/api/src/modules/reports). Operational sections
 * need reporting:report:read; money needs finance:report:read — the overview
 * returns `financeIncluded: false` and null money fields without it. Each hook
 * takes `enabled` so a section the account may not read is never requested.
 */

export interface ReportOverview {
  totalPilgrims: number; activePilgrims: number; inKingdomCount: number; confirmedBookings: number;
  hotelCount: number; vehicleCount: number; openVisaCases: number;
  financeIncluded: boolean; revenuePaidCents: number | null; revenueOutstandingCents: number | null;
}

function useReport<T>(path: string, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', path],
    queryFn: async () => (await apiClient.get(`/reports/${path}`)).data.data as T,
    enabled,
  });
}

export const useOverviewReport = (enabled = true) => useReport<ReportOverview>('overview', enabled);
export const usePilgrimReport = (enabled = true) =>
  useReport<{ total: number; byStatus: Record<string, number>; byGender: Record<string, number> }>('pilgrims', enabled);
export const useBookingReport = (enabled = true) =>
  useReport<{ total: number; byStatus: Record<string, number>; monthlyTrend: { month: string; count: number }[] }>('bookings', enabled);
export const useHotelReport = (enabled = true) => useReport<{
  totalHotels: number;
  rooms: { total: number; byStatus: Record<string, number>; occupancyRate: number };
  bookings: { total: number; byStatus: Record<string, number> };
  allotments: { contracts: number; totalRooms: number; bookedRooms: number; availableRooms: number };
}>('hotels', enabled);
export const useVisaReport = (enabled = true) =>
  useReport<{ byStatus: Record<string, number>; total: number; decided: number; successRate: number }>('visa', enabled);
export const useTransportReport = (enabled = true) => useReport<{
  vehicles: { total: number; active: number; byStatus: Record<string, number> };
  trips: { total: number; byStatus: Record<string, number>; next30Days: number; passengersCarried: number };
  seats: { offered: number; sold: number; utilizationRate: number };
}>('transport', enabled);
export const useFinanceReport = (enabled = true) => useReport<{
  paid: { amountCents: number; count: number }; outstanding: { amountCents: number; count: number };
  draft: { amountCents: number; count: number }; collectedCents: number;
}>('finance', enabled);

/** Downloads the server-built CSV (reporting:report:export) as a file. */
export async function downloadReportCsv() {
  const res = await apiClient.get('/reports/export', { responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `umrah-connect-report-${new Date().toISOString().slice(0, 10)}.csv`;
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
