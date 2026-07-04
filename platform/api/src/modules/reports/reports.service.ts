import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getOverview(tenantId: string) {
    const [totalPilgrims, activePilgrims, confirmedBookings, hotelCount, vehicleCount] = await Promise.all([
      this.prisma.pilgrim.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.pilgrim.count({
        where: {
          tenantId, deletedAt: null,
          status: { in: ['BOOKED', 'VISA_PENDING', 'VISA_APPROVED', 'TRAVELING', 'IN_KINGDOM'] as any },
        },
      }),
      this.prisma.booking.count({
        where: { tenantId, status: { in: ['CONFIRMED', 'PARTIALLY_PAID', 'FULLY_PAID'] as any } },
      }),
      this.prisma.hotel.count({ where: { tenantId } }),
      this.prisma.vehicle.count({ where: { tenantId } }),
    ]);
    const [revData, outstandingData] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { tenantId, status: 'PAID' }, _sum: { totalCents: true } }),
      this.prisma.invoice.aggregate({ where: { tenantId, status: { in: ['ISSUED', 'PARTIALLY_PAID', 'SENT'] as any } }, _sum: { totalCents: true } }),
    ]);
    return {
      totalPilgrims, activePilgrims, confirmedBookings, hotelCount, vehicleCount,
      revenuePaidCents: Number(revData._sum.totalCents ?? 0),
      revenueOutstandingCents: Number(outstandingData._sum.totalCents ?? 0),
    };
  }

  async getPilgrimAnalytics(tenantId: string) {
    const statuses = ['LEAD', 'PROSPECT', 'BOOKED', 'DOCUMENTS_PENDING', 'VISA_PENDING', 'VISA_APPROVED', 'VISA_REJECTED', 'TRAVELING', 'IN_KINGDOM', 'RETURNED', 'CANCELLED'];
    const counts = await Promise.all(statuses.map(s => this.prisma.pilgrim.count({ where: { tenantId, status: s as any, deletedAt: null } })));
    const byStatus: Record<string, number> = {};
    statuses.forEach((s, i) => { byStatus[s] = counts[i]; });
    const [male, female] = await Promise.all([
      this.prisma.pilgrim.count({ where: { tenantId, gender: 'MALE', deletedAt: null } }),
      this.prisma.pilgrim.count({ where: { tenantId, gender: 'FEMALE', deletedAt: null } }),
    ]);
    return { byStatus, byGender: { MALE: male, FEMALE: female } };
  }

  async getBookingAnalytics(tenantId: string) {
    const statuses = ['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'FULLY_PAID', 'CANCELLED', 'COMPLETED'];
    const counts = await Promise.all(statuses.map(s => this.prisma.booking.count({ where: { tenantId, status: s as any } })));
    const byStatus: Record<string, number> = {};
    statuses.forEach((s, i) => { byStatus[s] = counts[i]; });
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1); d.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setMonth(end.getMonth() + 1);
      const count = await this.prisma.booking.count({ where: { tenantId, createdAt: { gte: d, lt: end } } });
      months.push({ month: d.toISOString().substring(0, 7), count });
    }
    return { byStatus, monthlyTrend: months };
  }

  async getHotelAnalytics(tenantId: string) {
    const hotels = await this.prisma.hotel.findMany({
      where: { tenantId },
      include: {
        allotments: {
          select: { totalRooms: true, bookedRooms: true },
        },
      },
    });
    const summary = hotels.reduce(
      (acc: any, h: any) => {
        const totalRooms = h.allotments.reduce((s: number, a: any) => s + a.totalRooms, 0);
        const bookedRooms = h.allotments.reduce((s: number, a: any) => s + a.bookedRooms, 0);
        acc.totalRooms += totalRooms;
        acc.bookedRooms += bookedRooms;
        return acc;
      },
      { totalRooms: 0, bookedRooms: 0 },
    );
    return { totalHotels: hotels.length, ...summary, availableRooms: summary.totalRooms - summary.bookedRooms };
  }

  async getFinanceAnalytics(tenantId: string) {
    const [paid, outstanding, draft] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { tenantId, status: 'PAID' }, _sum: { totalCents: true }, _count: true }),
      this.prisma.invoice.aggregate({ where: { tenantId, status: { in: ['ISSUED', 'PARTIALLY_PAID', 'SENT'] as any } }, _sum: { totalCents: true }, _count: true }),
      this.prisma.invoice.aggregate({ where: { tenantId, status: 'DRAFT' }, _sum: { totalCents: true }, _count: true }),
    ]);
    return {
      paid: { amountCents: Number(paid._sum.totalCents ?? 0), count: paid._count },
      outstanding: { amountCents: Number(outstanding._sum.totalCents ?? 0), count: outstanding._count },
      draft: { amountCents: Number(draft._sum.totalCents ?? 0), count: draft._count },
    };
  }

  async getVisaAnalytics(tenantId: string) {
    const statuses = ['NOT_STARTED', 'DOCUMENTS_COLLECTING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED'];
    const counts = await Promise.all(statuses.map(s => this.prisma.visaApplication.count({ where: { tenantId, status: s as any } })));
    const byStatus: Record<string, number> = {};
    statuses.forEach((s, i) => { byStatus[s] = counts[i]; });
    const total = counts.reduce((a, b) => a + b, 0);
    const successRate = total > 0 ? Math.round(((byStatus['APPROVED'] ?? 0) / total) * 100) : 0;
    return { byStatus, total, successRate };
  }
}
