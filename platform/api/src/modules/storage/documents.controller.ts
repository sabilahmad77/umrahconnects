import {
  BadRequestException, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AllowPendingTenant, AnyAuthenticated } from '../../common/decorators/access.decorator';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import { DocumentAccessService } from './document-access.service';
import { StorageService } from './storage.service';
import type { Principal } from '../auth/principal';

const upload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

@ApiTags('documents')
@Controller({ path: 'documents', version: '1' })
export class DocumentsController {
  constructor(
    private readonly access: DocumentAccessService,
    private readonly storage: StorageService,
  ) {}

  @ApiBearerAuth()
  @Get('visa/:docId/url')
  @RequirePermissions('visa:application:read')
  @ApiOperation({ summary: 'Short-lived download URL for a visa document file (latest or ?version=)' })
  async visaDocumentUrl(
    @CurrentUser() user: Principal,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Query('version') version?: string,
  ) {
    const v = version === undefined ? undefined : Number(version);
    if (v !== undefined && (!Number.isInteger(v) || v < 1)) throw new BadRequestException('version must be a positive integer');
    return { success: true, data: await this.access.visaDocumentUrl(user, docId, v) };
  }

  @ApiBearerAuth()
  @Post('kyc')
  @RequirePermissions('core:tenant:update')
  @AllowPendingTenant()
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(upload)
  @ApiOperation({ summary: 'Upload a private KYC document for the current organization' })
  async uploadKyc(@CurrentUser() user: Principal, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded (field name must be "file")');
    return { success: true, data: await this.access.uploadKycDocument(user, file) };
  }

  @ApiBearerAuth()
  @Get('kyc/:kycId/:index/url')
  @AnyAuthenticated()
  @AllowPendingTenant()
  @ApiOperation({ summary: 'Short-lived URL for a KYC document (own organization or platform reviewer)' })
  async kycUrl(
    @CurrentUser() user: Principal,
    @Param('kycId', ParseUUIDPipe) kycId: string,
    @Param('index', ParseIntPipe) index: number,
  ) {
    return { success: true, data: await this.access.kycDocumentUrl(user, kycId, index) };
  }

  /** The signature is the credential; the link expires within minutes. */
  @Public()
  @Get('signed/:token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async signed(@Param('token') token: string, @Res() res: Response) {
    const claims = await this.access.resolveSignedToken(token);
    const { stream, size } = this.storage.openLocal(claims.key);
    const filename = claims.name.replace(/[^\w.\- ]/g, '_');
    res.setHeader('Content-Type', claims.mime);
    res.setHeader('Content-Length', String(size));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    stream.pipe(res);
  }
}
