import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import multer from 'multer';
import { IMAGE_MAX_BYTES } from '../storage/storage.service';

const MB = IMAGE_MAX_BYTES / 1024 / 1024;

/** Turns multer's terse errors into messages a person can act on. */
export function uploadErrorToHttp(err: unknown): HttpException {
  if (err instanceof HttpException) return err;
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return new PayloadTooLargeException(`Images must be ${MB} MB or smaller`);
      case 'LIMIT_FILE_COUNT':
      case 'LIMIT_UNEXPECTED_FILE':
        return new BadRequestException('Upload one image at a time in the "file" field');
      default:
        return new BadRequestException('The upload could not be read. Try again.');
    }
  }
  return new BadRequestException('The upload could not be read. Try again.');
}

/**
 * Buffers one image (field `file`) in memory, refusing anything above the image
 * size limit while it streams in. Replaces FileInterceptor so an oversize upload
 * is answered with the actual limit instead of multer's bare "File too large".
 */
@Injectable()
export class ImageUploadInterceptor implements NestInterceptor {
  private readonly single = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: IMAGE_MAX_BYTES, files: 1, fields: 10, parts: 12 },
  }).single('file');

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    await new Promise<void>((resolve, reject) =>
      this.single(http.getRequest(), http.getResponse(), (err: unknown) =>
        err ? reject(uploadErrorToHttp(err)) : resolve(),
      ),
    );
    return next.handle();
  }
}
