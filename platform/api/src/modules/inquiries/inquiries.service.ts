import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const VALID_TYPES = ['CONTACT', 'PARTNER', 'CAREERS', 'NEWSLETTER', 'DEMO', 'SUPPORT'];

@Injectable()
export class InquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public — store a website form submission (contact / partner / careers / newsletter / demo). */
  async create(dto: any) {
    const type = String(dto.type ?? 'CONTACT').toUpperCase();
    if (!VALID_TYPES.includes(type)) {
      throw new BadRequestException(`Invalid inquiry type "${dto.type}". Allowed: ${VALID_TYPES.join(', ')}`);
    }
    const email = String(dto.email ?? '').trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('A valid email address is required.');
    }
    const created = await this.prisma.publicInquiry.create({
      data: {
        type: type as any,
        name: dto.name?.toString().slice(0, 160) || null,
        email: email.slice(0, 200),
        phone: dto.phone?.toString().slice(0, 40) || null,
        company: dto.company?.toString().slice(0, 200) || null,
        subject: dto.subject?.toString().slice(0, 240) || null,
        message: dto.message?.toString() || null,
        metadata: dto.metadata ?? undefined,
      },
    });
    return { id: created.id, type: created.type, status: created.status };
  }

  /** Admin — list submissions, optionally filtered by type/status. */
  async findAll(query: any = {}) {
    const { type, status, page = 1, limit = 50 } = query;
    const where: any = {};
    if (type) where.type = String(type).toUpperCase();
    if (status) where.status = String(status).toUpperCase();
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total, counts] = await Promise.all([
      this.prisma.publicInquiry.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: Number(limit) }),
      this.prisma.publicInquiry.count({ where }),
      this.prisma.publicInquiry.groupBy({ by: ['type'], _count: { _all: true } }),
    ]);
    const byType = Object.fromEntries(counts.map((c) => [c.type, c._count._all]));
    const newCount = await this.prisma.publicInquiry.count({ where: { status: 'NEW' } });
    return { items, total, byType, newCount };
  }

  async updateStatus(id: string, status: string) {
    const S = String(status).toUpperCase();
    if (!['NEW', 'IN_REVIEW', 'RESOLVED', 'ARCHIVED'].includes(S)) {
      throw new BadRequestException(`Invalid status "${status}"`);
    }
    const found = await this.prisma.publicInquiry.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Inquiry not found');
    return this.prisma.publicInquiry.update({ where: { id }, data: { status: S as any } });
  }
}
