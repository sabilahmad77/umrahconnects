import { Injectable, Logger, BadRequestException, ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomBytes } from 'crypto';
import { createReadStream, existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join, normalize, sep } from 'path';
import type { Readable } from 'stream';
import { sniffFile, SniffedType } from './file-sniff';

export type StorageDriver = 'local' | 'r2' | 's3';
export type Visibility = 'public' | 'private';

export interface StoredObject {
  /** Public objects: a permanent URL. Private objects: an opaque `private:` reference (use a signed URL to read). */
  url: string;
  storageKey: string;
  driver: StorageDriver;
  visibility: Visibility;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}

export interface PutFileInput {
  buffer: Buffer;
  originalName: string;
  /** Client-declared type; informational only — the stored type comes from content sniffing. */
  mimeType?: string;
  /** Logical folder, e.g. `visa-documents/<applicationId>`. */
  prefix: string;
}

const DOCUMENT_TYPES: SniffedType[] = ['pdf', 'jpeg', 'png', 'webp', 'heic', 'tiff'];
const IMAGE_TYPES: SniffedType[] = ['jpeg', 'png', 'webp', 'gif'];
const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * One seam for every binary the platform stores.
 *
 * Drivers:
 *  - `local`: disk under ./uploads. Public media are flat files served at
 *    /uploads/<file>; private documents live under ./uploads/private and are
 *    never served statically. Production use requires a persistent volume.
 *  - `r2` / `s3`: S3-compatible object storage (Cloudflare R2 via S3_ENDPOINT).
 *    Private documents go to S3_BUCKET (must not be public) and are read through
 *    short-lived presigned URLs; public media go to S3_PUBLIC_BUCKET and are
 *    addressed through S3_PUBLIC_BASE_URL.
 *
 * File types are decided by content (magic bytes), never by the file name or
 * the client-declared MIME type.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly localDir = join(process.cwd(), 'uploads');
  private s3?: S3Client;

  constructor(private config: ConfigService) {
    if (this.driver === 'local') {
      mkdirSync(join(this.localDir, 'private'), { recursive: true });
      if (this.config.get('NODE_ENV') === 'production' && this.config.get('STORAGE_LOCAL_PERSISTENT') !== 'true') {
        this.logger.warn('STORAGE_DRIVER=local in production without a persistent volume — uploads will be lost on redeploy.');
      }
    }
  }

  get driver(): StorageDriver {
    const d = (this.config.get<string>('STORAGE_DRIVER') ?? 'local').toLowerCase();
    return (d === 'r2' || d === 's3' ? d : 'local') as StorageDriver;
  }

  /** Whether the configured driver has everything it needs to run. */
  get status() {
    const missing = this.missingConfig();
    return {
      driver: this.driver,
      configured: missing.length === 0,
      missing,
      ephemeral: this.driver === 'local' && this.config.get('STORAGE_LOCAL_PERSISTENT') !== 'true',
      publicMedia: this.driver === 'local' || !!this.config.get('S3_PUBLIC_BUCKET'),
    };
  }

  private missingConfig(): string[] {
    const need = (keys: string[]) => keys.filter((k) => !this.config.get(k));
    if (this.driver === 'r2') return need(['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']);
    if (this.driver === 's3') return need(['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']);
    return [];
  }

  private requireReady() {
    const missing = this.missingConfig();
    if (missing.length) {
      throw new ServiceUnavailableException(`File storage is not configured. Missing: ${missing.join(', ')}`);
    }
  }

  private client(): S3Client {
    if (!this.s3) {
      this.s3 = new S3Client({
        region: this.driver === 'r2' ? 'auto' : this.config.get<string>('S3_REGION'),
        endpoint: this.config.get<string>('S3_ENDPOINT') || undefined,
        forcePathStyle: this.driver === 'r2' ? false : this.config.get('S3_FORCE_PATH_STYLE') === 'true',
        credentials: {
          accessKeyId: this.config.get<string>('S3_ACCESS_KEY_ID')!,
          secretAccessKey: this.config.get<string>('S3_SECRET_ACCESS_KEY')!,
        },
      });
    }
    return this.s3;
  }

  private validate(input: PutFileInput, allowed: SniffedType[], maxBytes: number) {
    if (!input.buffer?.length) throw new BadRequestException('Uploaded file is empty');
    if (input.buffer.length > maxBytes) throw new BadRequestException(`File is larger than ${maxBytes / 1024 / 1024} MB`);
    const sniffed = sniffFile(input.buffer);
    if (!sniffed || !allowed.includes(sniffed.type)) {
      throw new BadRequestException(
        `File content is not an accepted type. Allowed: ${allowed.join(', ')}`,
      );
    }
    return sniffed;
  }

  private static safePrefix(prefix: string) {
    const clean = prefix.replace(/[^A-Za-z0-9/_-]/g, '').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
    if (!clean || clean.split('/').some((s) => s === '' || s === '.' || s === '..')) {
      throw new BadRequestException('Invalid storage location');
    }
    return clean;
  }

  /** Private document (visa, KYC, traveler documents). Never publicly addressable. */
  async put(input: PutFileInput): Promise<StoredObject> {
    this.requireReady();
    const sniffed = this.validate(input, DOCUMENT_TYPES, DOCUMENT_MAX_BYTES);
    const checksum = createHash('sha256').update(input.buffer).digest('hex');
    const key = `${StorageService.safePrefix(input.prefix)}/${Date.now()}-${randomBytes(12).toString('hex')}.${sniffed.ext}`;

    if (this.driver === 'local') {
      const full = this.localPath(key);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, input.buffer, { mode: 0o640 });
    } else {
      await this.client().send(
        new PutObjectCommand({
          Bucket: this.config.get<string>('S3_BUCKET'),
          Key: key,
          Body: input.buffer,
          ContentType: sniffed.mime,
          ContentDisposition: 'attachment',
          ChecksumSHA256: Buffer.from(checksum, 'hex').toString('base64'),
          Metadata: { sha256: checksum },
        }),
      );
    }
    return {
      url: `private:${key}`,
      storageKey: key,
      driver: this.driver,
      visibility: 'private',
      mimeType: sniffed.mime,
      sizeBytes: input.buffer.length,
      checksum,
    };
  }

  /** Public media (avatars, post and listing images). */
  async putPublicImage(input: Omit<PutFileInput, 'prefix'>): Promise<StoredObject> {
    this.requireReady();
    const sniffed = this.validate({ ...input, prefix: 'media' }, IMAGE_TYPES, IMAGE_MAX_BYTES);
    const checksum = createHash('sha256').update(input.buffer).digest('hex');
    const name = `${Date.now()}-${randomBytes(12).toString('hex')}.${sniffed.ext}`;

    let url: string;
    if (this.driver === 'local') {
      writeFileSync(join(this.localDir, name), input.buffer, { mode: 0o644 });
      url = `/uploads/${name}`;
    } else {
      const bucket = this.config.get<string>('S3_PUBLIC_BUCKET');
      const base = this.config.get<string>('S3_PUBLIC_BASE_URL')?.replace(/\/+$/, '');
      if (!bucket || !base) {
        throw new ServiceUnavailableException('Public media storage is not configured. Missing: S3_PUBLIC_BUCKET, S3_PUBLIC_BASE_URL');
      }
      await this.client().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `media/${name}`,
          Body: input.buffer,
          ContentType: sniffed.mime,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      url = `${base}/media/${name}`;
    }
    return { url, storageKey: `media/${name}`, driver: this.driver, visibility: 'public', mimeType: sniffed.mime, sizeBytes: input.buffer.length, checksum };
  }

  private localPath(key: string) {
    const root = join(this.localDir, 'private');
    const full = normalize(join(root, key));
    if (!full.startsWith(root + sep)) throw new BadRequestException('Invalid storage key');
    return full;
  }

  /** Short-lived URL for a private object (R2/S3). Local objects use the API's signed route instead. */
  async presignedUrl(storageKey: string, opts: { filename?: string; expiresInSeconds?: number } = {}): Promise<string> {
    const disposition = `attachment; filename="${(opts.filename ?? 'document').replace(/[^\w.\- ]/g, '_')}"`;
    return getSignedUrl(
      this.client(),
      new GetObjectCommand({
        Bucket: this.config.get<string>('S3_BUCKET'),
        Key: storageKey,
        ResponseContentDisposition: disposition,
      }),
      { expiresIn: Math.min(opts.expiresInSeconds ?? 300, 900) },
    );
  }

  /** Streams a private object stored on local disk. */
  openLocal(storageKey: string): { stream: Readable; size: number } {
    const full = this.localPath(storageKey);
    if (!existsSync(full)) throw new NotFoundException('File not found');
    return { stream: createReadStream(full), size: statSync(full).size };
  }

  /** Best-effort removal of a superseded object; never throws. */
  async remove(storageKey?: string | null, driver: StorageDriver = 'local') {
    if (!storageKey) return;
    try {
      if (driver === 'local') {
        const full = this.localPath(storageKey);
        if (existsSync(full)) unlinkSync(full);
      } else if (driver === this.driver) {
        await this.client().send(new DeleteObjectCommand({ Bucket: this.config.get<string>('S3_BUCKET'), Key: storageKey }));
      }
    } catch (err) {
      this.logger.warn(`Could not remove ${storageKey}: ${(err as Error).message}`);
    }
  }
}
