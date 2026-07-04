import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePilgrimDto } from './dto/create-pilgrim.dto';
import { UpdatePilgrimDto } from './dto/update-pilgrim.dto';
import { QueryPilgrimDto } from './dto/query-pilgrim.dto';
import { AddDocumentDto } from './dto/add-document.dto';

@Injectable()
export class PilgrimsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: QueryPilgrimDto) {
    const { page = 1, limit = 20, search, status, tags } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { firstNameEn: { contains: search, mode: 'insensitive' } },
        { lastNameEn: { contains: search, mode: 'insensitive' } },
        { firstNameAr: { contains: search, mode: 'insensitive' } },
        { lastNameAr: { contains: search, mode: 'insensitive' } },
        { passportNumber: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (tags && tags.length > 0) {
      where.tags = { hasSome: tags };
    }

    const [items, total] = await Promise.all([
      this.prisma.pilgrim.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          familyGroup: true,
        },
      }),
      this.prisma.pilgrim.count({ where }),
    ]);

    const normalized = items.map((p: any) => ({ ...p, lifetimeSpend: Number(p.lifetimeSpend ?? 0) }));
    return { items: normalized, total, page, limit };
  }

  async findOne(tenantId: string, id: string) {
    const pilgrim = await this.prisma.pilgrim.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        documents: true,
        familyGroup: true,
      },
    });

    if (!pilgrim) {
      throw new NotFoundException(`Pilgrim ${id} not found`);
    }

    // Fetch related bookings separately
    const bookings = await this.prisma.booking.findMany({
      where: { tenantId, pilgrims: { some: { pilgrimId: id } } },
      include: { package: { select: { id: true, name: true, tripType: true } } },
      take: 5,
    });

    // Fetch visa applications separately
    const visaApplications = await this.prisma.visaApplication.findMany({
      where: { tenantId, pilgrimId: id },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, status: true, regulatorySystem: true, externalRef: true, approvedAt: true },
    });

    return { ...pilgrim, lifetimeSpend: Number((pilgrim as any).lifetimeSpend ?? 0), bookings, visaApplications };
  }

  async create(tenantId: string, dto: CreatePilgrimDto, createdBy: string) {
    return this.prisma.pilgrim.create({
      data: {
        tenantId,
        createdBy,
        status: (dto.status as any) ?? 'LEAD',
        firstNameEn: dto.firstName,
        lastNameEn: dto.lastName,
        firstNameAr: dto.firstNameAr,
        lastNameAr: dto.lastNameAr,
        gender: (dto.gender as any) ?? 'MALE',
        phone: dto.phone,
        email: dto.email,
        passportNumber: dto.passportNumber,
        passportExpiry: dto.passportExpiry ? new Date(dto.passportExpiry) : undefined,
        nationality: dto.nationality ?? 'SA',
        country: (dto as any).country ?? 'SA',
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : new Date('1990-01-01'),
        address: dto.address,
        familyGroupId: dto.familyGroupId,
        notes: dto.notes,
        tags: dto.tags ?? [],
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdatePilgrimDto) {
    await this.findOne(tenantId, id);
    const data: any = {};
    if ((dto as any).firstName !== undefined) data.firstNameEn = (dto as any).firstName;
    if ((dto as any).lastName !== undefined) data.lastNameEn = (dto as any).lastName;
    if (dto.firstNameAr !== undefined) data.firstNameAr = dto.firstNameAr;
    if (dto.lastNameAr !== undefined) data.lastNameAr = dto.lastNameAr;
    if (dto.passportNumber !== undefined) data.passportNumber = dto.passportNumber;
    if (dto.passportExpiry) data.passportExpiry = new Date(dto.passportExpiry);
    if (dto.dateOfBirth) data.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.status !== undefined) data.status = dto.status;
    if ((dto as any).familyGroupId !== undefined) data.familyGroupId = (dto as any).familyGroupId;
    return this.prisma.pilgrim.update({ where: { id }, data });
  }

  // ── Assignment helpers ──────────────────────────────────────────────
  async assignToFamilyGroup(tenantId: string, id: string, familyGroupId: string | null) {
    await this.findOne(tenantId, id);
    return this.prisma.pilgrim.update({ where: { id }, data: { familyGroupId } });
  }

  /**
   * Attach the pilgrim to an existing booking (or create one with the given package).
   * Returns the booking + bookingPilgrim record.
   */
  async assignToBooking(tenantId: string, pilgrimId: string, bookingId: string) {
    await this.findOne(tenantId, pilgrimId);
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, tenantId } });
    if (!booking) throw new NotFoundException('Booking not found');
    const existing = await this.prisma.bookingPilgrim.findFirst({ where: { bookingId, pilgrimId } });
    if (existing) return existing;
    return this.prisma.bookingPilgrim.create({ data: { tenantId, bookingId, pilgrimId } });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    return this.prisma.pilgrim.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async addDocument(tenantId: string, pilgrimId: string, dto: AddDocumentDto) {
    await this.findOne(tenantId, pilgrimId);

    return this.prisma.pilgrimDocument.create({
      data: {
        tenantId,
        pilgrimId,
        type: dto.type,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        mimeType: dto.mimeType ?? 'application/octet-stream',
        fileSizeBytes: dto.fileSize ?? 0,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  async exportAll(tenantId: string) {
    return this.prisma.pilgrim.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        familyGroup: true,
      },
    });
  }

  async getStats(tenantId: string) {
    const statuses = [
      'LEAD',
      'PROSPECT',
      'BOOKED',
      'DOCUMENTS_PENDING',
      'VISA_PENDING',
      'VISA_APPROVED',
      'VISA_REJECTED',
      'TRAVELING',
      'IN_KINGDOM',
      'RETURNED',
      'CANCELLED',
    ];

    const counts = await Promise.all(
      statuses.map((status) =>
        this.prisma.pilgrim.count({
          where: { tenantId, status: status as any, deletedAt: null },
        }),
      ),
    );

    const result: Record<string, number> = {};
    statuses.forEach((status, index) => {
      result[status] = counts[index];
    });

    const total = await this.prisma.pilgrim.count({
      where: { tenantId, deletedAt: null },
    });

    return { byStatus: result, total };
  }
}
