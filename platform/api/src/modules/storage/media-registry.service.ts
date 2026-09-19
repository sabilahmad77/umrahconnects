import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { requireId } from '../../common/tenant-scope';
import type { Principal } from '../auth/principal';
import { StorageService, StoredObject } from './storage.service';

/** Most images a single listing can carry. */
export const MAX_LISTING_IMAGES = 12;

/** The shape POST /uploads returns. `url`, `size` and `mime` are the original contract. */
export interface MediaUploadResult {
  id: string;
  url: string;
  size: number;
  mime: string;
  name: string | null;
}

const MEDIA_NAME_IN_URL = /(\d{13}-[0-9a-f]{24}\.[a-z0-9]{2,5})$/;

/**
 * Registry of public media written through POST /uploads.
 *
 * The object store itself does not know who uploaded a file. This table does,
 * which is what makes two things possible:
 *  - only the uploader may delete an image, and never while something still
 *    shows it;
 *  - a listing may only display images its own organization uploaded, so a
 *    listing cannot hot-link arbitrary third-party URLs or another seller's photos.
 */
@Injectable()
export class MediaRegistryService {
  private readonly logger = new Logger(MediaRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /** `media/<name>` for a public-media URL this platform issued, otherwise null. */
  static storageKeyForUrl(url: string): string | null {
    if (typeof url !== 'string') return null;
    const m = MEDIA_NAME_IN_URL.exec(url.split(/[?#]/)[0]);
    return m ? `media/${m[1]}` : null;
  }

  /** Stores the image, records its owner, and audits the upload. */
  async storePublicImage(
    principal: Principal,
    file: { buffer: Buffer; originalname?: string; mimetype?: string },
  ): Promise<MediaUploadResult> {
    const stored: StoredObject = await this.storage.putPublicImage({
      buffer: file.buffer,
      originalName: file.originalname ?? 'image',
      mimeType: file.mimetype,
    });
    // Display-only name: drop control characters, cap the length.
    const originalName =
      Array.from(file.originalname ?? '')
        .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
        .join('')
        .slice(0, 255) || null;
    let row;
    try {
      row = await this.prisma.mediaObject.create({
        data: {
          tenantId: principal.tenantId ?? null,
          ownerUserId: principal.sub,
          storageKey: stored.storageKey,
          url: stored.url,
          driver: stored.driver,
          visibility: 'public',
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          checksum: stored.checksum,
          originalName,
        },
      });
    } catch (err) {
      // Without a registry row nobody could ever delete this file; do not keep it.
      await this.storage.removePublicMedia(stored.storageKey).catch(() => undefined);
      throw err;
    }
    await this.audit.log({
      tenantId: principal.tenantId,
      actorId: principal.sub,
      actorEmail: principal.email ?? undefined,
      action: 'DOCUMENT_UPLOAD',
      namespace: 'media',
      resource: 'public_image',
      resourceId: stored.storageKey,
      metadata: { mediaId: row.id, sizeBytes: stored.sizeBytes, mime: stored.mimeType },
    });
    return { id: row.id, url: row.url, size: row.sizeBytes, mime: row.mimeType, name: row.originalName };
  }

  /**
   * Where a public media URL is still shown. Covers every column that stores
   * public media; the orphan cleanup job additionally scans the whole database.
   */
  async referencesTo(url: string): Promise<string[]> {
    const has = { has: url };
    const checks: [string, Promise<number>][] = [
      ['a marketplace listing', this.prisma.listing.count({ where: { imageUrls: has } })],
      ['a seller profile', this.prisma.vendor.count({ where: { OR: [{ logoUrl: url }, { images: has }] } })],
      ['a user avatar', this.prisma.user.count({ where: { avatarUrl: url } })],
      [
        'a social profile',
        this.prisma.socialAccount.count({ where: { OR: [{ avatarUrl: url }, { coverUrl: url }] } }),
      ],
      ['a post', this.prisma.post.count({ where: { OR: [{ mediaUrls: has }, { attachmentUrl: url }] } })],
      ['a message', this.prisma.message.count({ where: { mediaUrls: has } })],
      ['a group post', this.prisma.groupPost.count({ where: { mediaUrls: has } })],
      ['a group cover', this.prisma.tripGroup.count({ where: { coverUrl: url } })],
      ['a hotel', this.prisma.hotel.count({ where: { images: has } })],
      ['a room type', this.prisma.roomType.count({ where: { images: has } })],
      ['a room', this.prisma.room.count({ where: { images: has } })],
      [
        'a vehicle',
        this.prisma.vehicle.count({ where: { OR: [{ imageUrls: has }, { documentUrls: has }] } }),
      ],
      [
        'a driver profile',
        this.prisma.driver.count({ where: { OR: [{ photoUrl: url }, { documentUrls: has }] } }),
      ],
      ['a permit', this.prisma.tasreehPermit.count({ where: { documentUrl: url } })],
    ];
    const counts = await Promise.all(checks.map(([, p]) => p));
    return checks.filter((_, i) => counts[i] > 0).map(([label]) => label);
  }

  /** Deletes an image the caller uploaded, once nothing shows it any more. */
  async deleteOwn(principal: Principal, id: string) {
    const media = await this.prisma.mediaObject.findFirst({
      where: { id: requireId(id, 'Media'), ownerUserId: principal.sub, deletedAt: null },
    });
    if (!media) throw new NotFoundException('Media not found');

    const inUse = async () => {
      const usedBy = await this.referencesTo(media.url);
      if (usedBy.length) {
        return new ConflictException(
          `This image is still used by ${usedBy.join(', ')}. Remove it there and save first.`,
        );
      }
      return null;
    };
    const busy = await inUse();
    if (busy) throw busy;
    if (media.driver !== this.storage.driver) {
      throw new ConflictException('This image is kept in a storage location that is not active, so it cannot be deleted now.');
    }

    // Tombstone first so a concurrent save cannot attach the image any more,
    // then re-check references and only then remove the bytes.
    const claimed = await this.prisma.mediaObject.updateMany({
      where: { id: media.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (claimed.count !== 1) throw new NotFoundException('Media not found');
    const raced = await inUse();
    if (raced) {
      await this.prisma.mediaObject.update({ where: { id: media.id }, data: { deletedAt: null } });
      throw raced;
    }
    try {
      await this.storage.removePublicMedia(media.storageKey);
    } catch (err) {
      await this.prisma.mediaObject.update({ where: { id: media.id }, data: { deletedAt: null } });
      this.logger.error(`Could not delete ${media.storageKey}: ${(err as Error).message}`);
      throw new ConflictException('The image could not be deleted right now. Try again.');
    }
    await this.audit.log({
      tenantId: principal.tenantId,
      actorId: principal.sub,
      actorEmail: principal.email ?? undefined,
      action: 'DOCUMENT_DELETE',
      namespace: 'media',
      resource: 'public_image',
      resourceId: media.storageKey,
      metadata: { mediaId: media.id },
    });
    return { id: media.id, deleted: true };
  }

  /**
   * Listing images must be media the caller's organization uploaded (and has not
   * deleted). URLs the listing already shows stay allowed, so rows created before
   * the registry existed can still be edited without losing their pictures.
   */
  async assertListingImages(tenantId: string, urls: string[], alreadyOnListing: string[] = []) {
    if (urls.length > MAX_LISTING_IMAGES) {
      throw new BadRequestException(`A listing can have at most ${MAX_LISTING_IMAGES} images`);
    }
    if (new Set(urls).size !== urls.length) throw new BadRequestException('Each image can only be added once');
    const existing = new Set(alreadyOnListing);
    const fresh = urls.filter((u) => !existing.has(u));
    if (!fresh.length) return;

    const keys = fresh.map((u) => MediaRegistryService.storageKeyForUrl(u));
    const rows = keys.some((k) => !k)
      ? []
      : await this.prisma.mediaObject.findMany({
          where: { storageKey: { in: keys as string[] }, deletedAt: null, tenantId },
          select: { storageKey: true, url: true },
        });
    const byKey = new Map(rows.map((r) => [r.storageKey, r.url]));
    const ok = fresh.every((u, i) => keys[i] && byKey.get(keys[i] as string) === u);
    if (!ok) {
      throw new BadRequestException(
        'Listing images must be uploaded through the image uploader by your organization',
      );
    }
  }
}
