import {
  BadRequestException,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AnyAuthenticated } from '../../common/decorators/access.decorator';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import { MediaRegistryService } from '../storage/media-registry.service';
import type { Principal } from '../auth/principal';
import { ImageUploadInterceptor } from './image-upload.interceptor';

/**
 * Public media upload (avatars, post and listing images). The file type is
 * decided by content sniffing; documents never go through this route.
 *
 * Response: `{ id, url, size, mime, name }` — `url`, `size` and `mime` are the
 * original contract; `id` identifies the upload for DELETE /uploads/:id.
 */
@ApiTags('uploads')
@ApiBearerAuth()
@Controller({ path: 'uploads', version: '1' })
export class UploadsController {
  constructor(private readonly media: MediaRegistryService) {}

  @Post()
  @AnyAuthenticated()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(ImageUploadInterceptor)
  @ApiOperation({ summary: 'Upload a public image (JPEG, PNG, WebP or GIF, at most 5 MB)' })
  async upload(@CurrentUser() user: Principal, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Choose an image to upload (form field "file")');
    return { success: true, data: await this.media.storePublicImage(user, file) };
  }

  /** Only the uploader may delete, and only once nothing shows the image any more. */
  @Delete(':id')
  @AnyAuthenticated()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Delete an image you uploaded that is no longer used' })
  async remove(@CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.media.deleteOwn(user, id) };
  }
}
