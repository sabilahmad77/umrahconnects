import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { extname, join } from 'path';

export interface StoredObject {
  url: string;
  storageKey: string;
  driver: StorageDriver;
  mimeType?: string;
  sizeBytes: number;
  checksum: string;
}

export type StorageDriver = 'local' | 's3' | 'cloudinary';

export interface PutFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType?: string;
  /** Logical folder, e.g. `visa-documents/<applicationId>`. */
  prefix: string;
}

/** Documents are evidence, so the allow-list is wider than image uploads. */
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.tif', '.tiff'];
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * One seam for every binary the platform stores.
 *
 * `local` writes to disk and is correct for development only — the container
 * filesystem on Render is ephemeral, so anything written there is lost on the
 * next deploy. `s3` and `cloudinary` are selected with STORAGE_DRIVER and
 * refuse to start work until their credentials are present, which keeps the
 * failure loud and configuration-shaped instead of silently losing files.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly localDir = join(process.cwd(), 'uploads');

  constructor(private config: ConfigService) {
    mkdirSync(this.localDir, { recursive: true });
    if (this.driver === 'local' && this.config.get('NODE_ENV') === 'production') {
      this.logger.warn(
        'STORAGE_DRIVER=local in production — uploads live on an ephemeral disk ' +
        'and will be lost on redeploy. Set STORAGE_DRIVER=s3 or cloudinary.',
      );
    }
  }

  get driver(): StorageDriver {
    return (this.config.get<string>('STORAGE_DRIVER') ?? 'local') as StorageDriver;
  }

  /** Whether the configured driver has everything it needs to run. */
  get status(): { driver: StorageDriver; configured: boolean; missing: string[]; ephemeral: boolean } {
    const missing = this.missingConfig();
    return {
      driver: this.driver,
      configured: missing.length === 0,
      missing,
      ephemeral: this.driver === 'local',
    };
  }

  private missingConfig(): string[] {
    const need = (keys: string[]) => keys.filter((k) => !this.config.get(k));
    switch (this.driver) {
      case 's3':
        return need(['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']);
      case 'cloudinary':
        return need(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']);
      default:
        return [];
    }
  }

  private validate(input: PutFileInput) {
    const ext = extname(input.originalName || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      throw new BadRequestException(
        `File type ${ext || '(none)'} is not accepted. Allowed: ${ALLOWED_EXT.join(', ')}`,
      );
    }
    if (!input.buffer?.length) throw new BadRequestException('Uploaded file is empty');
    if (input.buffer.length > MAX_BYTES) {
      throw new BadRequestException(`File is larger than ${MAX_BYTES / 1024 / 1024} MB`);
    }
    return ext;
  }

  async put(input: PutFileInput): Promise<StoredObject> {
    const ext = this.validate(input);
    const checksum = createHash('sha256').update(input.buffer).digest('hex');
    const key = `${input.prefix}/${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;

    const missing = this.missingConfig();
    if (missing.length) {
      // Configuration problem, not a client problem — 503, and say exactly what is absent.
      throw new ServiceUnavailableException(
        `Storage driver "${this.driver}" is not configured. Missing: ${missing.join(', ')}`,
      );
    }

    switch (this.driver) {
      case 'local':
        return this.putLocal(key, input, checksum);
      case 's3':
      case 'cloudinary':
        // Credentials are present but the SDK integration is deliberately not
        // wired yet — fail loudly rather than pretend the file was stored.
        throw new ServiceUnavailableException(
          `Storage driver "${this.driver}" is configured but its client is not enabled in this build.`,
        );
      default:
        throw new ServiceUnavailableException(`Unknown STORAGE_DRIVER "${this.driver}"`);
    }
  }

  private putLocal(key: string, input: PutFileInput, checksum: string): StoredObject {
    const full = join(this.localDir, key);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, input.buffer);
    return {
      url: `/uploads/${key}`,
      storageKey: key,
      driver: 'local',
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      checksum,
    };
  }

  /** Best-effort removal of a superseded object; never throws. */
  async remove(storageKey?: string | null, driver: StorageDriver = 'local') {
    if (!storageKey || driver !== 'local') return;
    try {
      const full = join(this.localDir, storageKey);
      if (existsSync(full)) unlinkSync(full);
    } catch (err) {
      this.logger.warn(`Could not remove ${storageKey}: ${(err as Error).message}`);
    }
  }
}
