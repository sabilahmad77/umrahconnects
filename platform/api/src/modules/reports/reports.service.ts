import { Injectable } from '@nestjs/common';
import { BookingStatus, PilgrimStatus, VisaStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Bookings past the draft stage and not called off. */
const LIVE_BOOKING_STATUSES: BookingStatus[] = ['CONFIRMED', 'PARTIALLY_PAID', 'FULLY_PAID', 'VISA_PROCESSING', 'TRAVELING'];
/** Invoices still waiting for money. */
const OPEN_INVOICE_STATUSES = ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const;
const OPEN_TRIP_STATUSES = ['DRAFT', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'];

const zeroes = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number>;
const cents = (v: bigint | number | null | undefined) => Number(v ?? 0);

/** A CSV cell that a spreadsheet will not execute (leading = + - @ are formula triggers). */
function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /** Money figures from the organization's invoices: collected so far and still owed. */
  private async invoiceTotals(tenantId: string) {
    const [collected, open] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { tenantId, status: { notIn: ['DRAFT', 'VOID', 'CANCELLED'] } }, _sum: { paidCents: true },
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId, status: { in: [...OPEN_INVOICE_STATUSES] } }, _sum: { totalCents: true, paidCents: true }, _count: true,
      }),
    ]);
    return {
      collectedCents: cents(collected._sum.paidCents),
      outstandingCents: Math.max(0, cents(open._sum.totalCents) - cents(open._sum.paidCents)),
      outstandingCount: open._count,
    };
  }

  async getOverview(tenantId: string, opts: { includeFinance: boolean }) {
    const [totalPilgrims, activePilgrims, inKingdomCount, confirmedBookings, hotelCount, vehicleCount, openVisaCases] = await Promise.all([
      this.prisma.pilgrim.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.pilgrim.count({
        where: { tenantId, deletedAt: null, status: { in: ['BOOKED', 'VISA_PENDING', 'VISA_APPROVED', 'TRAVELING', 'IN_KINGDOM'] } },
      }),
      // FIX-07: literal "in kingdom" count — matches the CRM IN_KINGDOM filter so
      // the dashboard tile and CRM view never contradict each other.
      this.prisma.pilgrim.count({ where: { tenantId, deletedAt: null, status: 'IN_KINGDOM' } }),
      this.prisma.booking.count({ where: { tenantId, status: { in: LIVE_BOOKING_STATUSES } } }),
      this.prisma.hotel.count({ where: { tenantId } }),
      this.prisma.vehicle.count({ where: { tenantId, isActive: true } }),
      this.prisma.visaApplication.count({ where: { tenantId, status: { in: ['NOT_STARTED', 'DOCUMENTS_COLLECTING', 'SUBMITTED', 'UNDER_REVIEW'] } } }),
    ]);
    const base = { totalPilgrims, activePilgrims, inKingdomCount, confirmedBookings, hotelCount, vehicleCount, openVisaCases };
    if (!opts.includeFinance) {
      // Operational report only: money figures need finance:report:read.
      return { ...base, financeIncluded: false, revenuePaidCents: null, revenueOutstandingCents: null };
    }
    const money = await this.invoiceTotals(tenantId);
    return {
      ...base,
      financeIncluded: true,
      revenuePaidCents: money.collectedCents,
      revenueOutstandingCents: money.outstandingCents,
    };
  }

  async getPilgrimAnalytics(tenantId: string) {
    const [statusRows, genderRows] = await Promise.all([
      this.prisma.pilgrim.groupBy({ by: ['status'], where: { tenantId, deletedAt: null }, _count: true }),
      this.prisma.pilgrim.groupBy({ by: ['gender'], where: { tenantId, deletedAt: null }, _count: true }),
    ]);
    const byStatus = zeroes(Object.values(PilgrimStatus));
    statusRows.forEach((r) => { byStatus[r.status] = r._count; });
    const byGender = zeroes(['MALE', 'FEMALE']);
    genderRows.forEach((r) => { if (r.gender) byGender[r.gender] = r._count; });
    return { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus, byGender };
  }

  async getBookingAnalytics(tenantId: string) {
    const rows = await this.prisma.booking.groupBy({ by: ['status'], where: { tenantId }, _count: true });
    const byStatus = zeroes(Object.values(BookingStatus));
    rows.forEach((r) => { byStatus[r.status] = r._count; });
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); d.setUTCHours(0, 0, 0, 0);
      const end = new Date(d); end.setUTCMonth(end.getUTCMonth() + 1);
      const count = await this.prisma.booking.count({ where: { tenantId, createdAt: { gte: d, lt: end } } });
      months.push({ month: d.toISOString().substring(0, 7), count });
    }
    return { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus, monthlyTrend: months };
  }

  /**
   * Hotel figures for both sides of the market: a hotel company's own rooms and
   * guest bookings, and an operator's contracted allotments (rooms bought / placed).
   */
  async getHotelAnalytics(tenantId: string) {
    const [totalHotels, rooms, bookingRows, allotments] = await Promise.all([
      this.prisma.hotel.count({ where: { tenantId } }),
      this.prisma.room.groupBy({ by: ['status'], where: { tenantId, status: { not: 'INACTIVE' } }, _count: true }),
      this.prisma.hotelBooking.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.allotment.aggregate({ where: { tenantId }, _sum: { totalRooms: true, bookedRooms: true }, _count: true }),
    ]);
    const roomsByStatus = zeroes(['AVAILABLE', 'OCCUPIED', 'MAINTENANCE']);
    rooms.forEach((r) => { roomsByStatus[r.status] = r._count; });
    const roomTotal = Object.values(roomsByStatus).reduce((a, b) => a + b, 0);
    const bookingsByStatus = zeroes(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED', 'CANCELLED']);
    bookingRows.forEach((r) => { bookingsByStatus[r.status] = r._count; });
    const contracted = allotments._sum.totalRooms ?? 0;
    const placed = allotments._sum.bookedRooms ?? 0;
    return {
      totalHotels,
      rooms: { total: roomTotal, byStatus: roomsByStatus, occupancyRate: roomTotal ? Math.round((roomsByStatus.OCCUPIED / roomTotal) * 100) : 0 },
      bookings: { total: Object.values(bookingsByStatus).reduce((a, b) => a + b, 0), byStatus: bookingsByStatus },
      allotments: { contracts: allotments._count, totalRooms: contracted, bookedRooms: placed, availableRooms: Math.max(0, contracted - placed) },
      // Kept for existing consumers: contracted inventory.
      totalRooms: contracted,
      bookedRooms: placed,
      availableRooms: Math.max(0, contracted - placed),
    };
  }

  async getVisaAnalytics(tenantId: string) {
    const rows = await this.prisma.visaApplication.groupBy({ by: ['status'], where: { tenantId }, _count: true });
    const byStatus = zeroes(Object.values(VisaStatus));
    rows.forEach((r) => { byStatus[r.status] = r._count; });
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const decided = byStatus.APPROVED + byStatus.REJECTED;
    return {
      byStatus,
      total,
      decided,
      /** Percentage (0–100, one decimal) of decided applications that were approved. */
      successRate: decided > 0 ? Math.round((byStatus.APPROVED / decided) * 1000) / 10 : 0,
    };
  }

  async getTransportAnalytics(tenantId: string) {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86_400_000);
    const [vehicleRows, activeVehicles, tripRows, upcoming, seats] = await Promise.all([
      this.prisma.vehicle.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.vehicle.count({ where: { tenantId, isActive: true, status: { not: 'INACTIVE' } } }),
      this.prisma.transportAssignment.groupBy({ by: ['status'], where: { tenantId }, _count: true, _sum: { passengerCount: true } }),
      this.prisma.transportAssignment.count({ where: { tenantId, status: { in: OPEN_TRIP_STATUSES }, scheduledAt: { gte: now, lte: in30 } } }),
      this.prisma.transportRoute.aggregate({
        where: { tenantId, status: { in: ['ACTIVE', 'FULLY_BOOKED'] }, totalSeats: { not: null } },
        _sum: { totalSeats: true, bookedSeats: true },
      }),
    ]);
    const vehiclesByStatus = zeroes(['AVAILABLE', 'BOOKED', 'IN_SERVICE', 'UNDER_MAINTENANCE', 'INACTIVE']);
    vehicleRows.forEach((r) => { vehiclesByStatus[r.status] = r._count; });
    const tripsByStatus = zeroes(['DRAFT', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
    let passengersCarried = 0;
    tripRows.forEach((r) => {
      tripsByStatus[r.status] = r._count;
      if (r.status === 'COMPLETED') passengersCarried = r._sum.passengerCount ?? 0;
    });
    const offered = seats._sum.totalSeats ?? 0;
    const sold = seats._sum.bookedSeats ?? 0;
    return {
      vehicles: { total: Object.values(vehiclesByStatus).reduce((a, b) => a + b, 0), active: activeVehicles, byStatus: vehiclesByStatus },
      trips: { total: Object.values(tripsByStatus).reduce((a, b) => a + b, 0), byStatus: tripsByStatus, next30Days: upcoming, passengersCarried },
      seats: { offered, sold, utilizationRate: offered ? Math.round((sold / offered) * 100) : 0 },
    };
  }

  async getFinanceAnalytics(tenantId: string) {
    const bucket = async (status: 'PAID' | 'DRAFT') => {
      const a = await this.prisma.invoice.aggregate({ where: { tenantId, status }, _sum: { totalCents: true }, _count: true });
      return { amountCents: cents(a._sum.totalCents), count: a._count };
    };
    const [paid, draft, money] = await Promise.all([bucket('PAID'), bucket('DRAFT'), this.invoiceTotals(tenantId)]);
    return {
      paid,
      outstanding: { amountCents: money.outstandingCents, count: money.outstandingCount },
      draft,
      collectedCents: money.collectedCents,
    };
  }

  /** One CSV (Section, Metric, Value) of every section the caller may read. */
  async exportCsv(tenantId: string, opts: { includeFinance: boolean }) {
    const sections: [string, unknown][] = [
      ['Overview', await this.getOverview(tenantId, opts)],
      ['Travelers', await this.getPilgrimAnalytics(tenantId)],
      ['Bookings', await this.getBookingAnalytics(tenantId)],
      ['Hotels', await this.getHotelAnalytics(tenantId)],
      ['Visa', await this.getVisaAnalytics(tenantId)],
      ['Transport', await this.getTransportAnalytics(tenantId)],
    ];
    if (opts.includeFinance) sections.push(['Finance', await this.getFinanceAnalytics(tenantId)]);
    const rows: string[][] = [['Section', 'Metric', 'Value']];
    const walk = (section: string, value: unknown, prefix: string) => {
      if (Array.isArray(value)) {
        value.forEach((item: any) => {
          if (item && typeof item === 'object' && 'month' in item) rows.push([section, `${prefix}${item.month}`, String(item.count ?? '')]);
        });
        return;
      }
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) walk(section, v, `${prefix}${k}.`);
        return;
      }
      if (value === null || value === undefined) return;
      rows.push([section, prefix.slice(0, -1), String(value)]);
    };
    for (const [section, data] of sections) walk(section, data, '');
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
}
