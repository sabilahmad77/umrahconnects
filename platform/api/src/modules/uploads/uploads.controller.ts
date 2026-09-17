import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { AnyAuthenticated } from '../../common/decorators/access.decorator';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../auth/principal';

/**
 * Public media upload (avatars, post and listing images). The file type is
 * decided by content sniffing; documents never go through this route.
 * Response contract unchanged: `{ url, size, mime }`.
 */
@ApiTags('uploads')
@ApiBearerAuth()
@Controller({ path: 'uploads', version: '1' })
export class UploadsController {
  constructor(
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @AnyAuthenticated()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async upload(@CurrentUser() user: Principal, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded (field name must be "file")');
    const stored = await this.storage.putPublicImage({ buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype });
    await this.audit.log({
      tenantId: user.tenantId, actorId: user.sub, action: 'DOCUMENT_UPLOAD', namespace: 'media',
      resource: 'public_image', resourceId: stored.storageKey, metadata: { sizeBytes: stored.sizeBytes, mime: stored.mimeType },
    });
    return { success: true, data: { url: stored.url, size: stored.sizeBytes, mime: stored.mimeType } };
  }
}
