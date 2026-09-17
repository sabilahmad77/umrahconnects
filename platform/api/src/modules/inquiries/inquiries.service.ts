import { Injectable, NotFoundException } from '@nestjs/common';
import { InquiryStatus, InquiryType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePublicInquiryDto, ListPublicInquiriesQueryDto } from './dto/inquiries.dto';

@Injectable()
export class InquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public — store a website form submission (contact / partner / careers / newsletter / demo). */
  async create(dto: CreatePublicInquiryDto) {
    const created = await this.prisma.publicInquiry.create({
      data: {
        type: dto.type ?? InquiryType.CONTACT,
        name: dto.name?.slice(0, 160) || null,
        email: dto.email.slice(0, 200),
        phone: dto.phone?.slice(0, 40) || null,
        company: dto.company?.slice(0, 200) || null,
        subject: dto.subject?.slice(0, 240) || null,
        message: dto.message || null,
        metadata: (dto.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
    return { id: created.id, type: created.type, status: created.status };
  }

  /** Platform — list submissions, optionally filtered by type/status. */
  async findAll(query: ListPublicInquiriesQueryDto = {}) {
    const { type, status } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.PublicInquiryWhereInput = {};
    if (type) where.type = type;
    if (status) where.status = status;
    const skip = (page - 1) * limit;
    const [items, total, counts] = await Promise.all([
      this.prisma.publicInquiry.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.publicInquiry.count({ where }),
      this.prisma.publicInquiry.groupBy({ by: ['type'], _count: { _all: true } }),
    ]);
    const byType = Object.fromEntries(counts.map((c) => [c.type, c._count._all]));
    const newCount = await this.prisma.publicInquiry.count({ where: { status: 'NEW' } });
    return { items, total, byType, newCount };
  }

  async updateStatus(id: string, status: InquiryStatus) {
    const found = await this.prisma.publicInquiry.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Inquiry not found');
    return this.prisma.publicInquiry.update({ where: { id }, data: { status } });
  }
}
