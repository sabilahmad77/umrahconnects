import {
  BadRequestException, Controller, Post, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { randomBytes } from 'crypto';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Media upload — local disk storage served at /uploads/<file>.
 * Swap diskStorage for S3/GCS in production; the response contract
 * ({ url }) stays the same so no client changes are needed.
 */
@ApiTags('uploads')
@ApiBearerAuth()
@Controller({ path: 'uploads', version: '1' })
export class UploadsController {
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: UPLOAD_DIR,
      filename: (_req: any, file: any, cb: any) => {
        const ext = extname(file.originalname || '').toLowerCase();
        cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: MAX_BYTES },
    fileFilter: (_req: any, file: any, cb: any) => {
      const ext = extname(file.originalname || '').toLowerCase();
      if (!ALLOWED.includes(ext)) {
        return cb(new BadRequestException(`File type ${ext || '(none)'} not allowed. Allowed: ${ALLOWED.join(', ')}`), false);
      }
      cb(null, true);
    },
  }))
  upload(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('No file uploaded (field name must be "file")');
    return { success: true, data: { url: `/uploads/${file.filename}`, size: file.size, mime: file.mimetype } };
  }
}
