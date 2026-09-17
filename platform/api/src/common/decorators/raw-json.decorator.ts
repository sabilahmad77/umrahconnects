import { Transform } from 'class-transformer';

/**
 * Keeps a free-form JSON value exactly as sent. Without it, the global
 * ValidationPipe (enableImplicitConversion) rewrites objects inside untyped
 * arrays into empty arrays — silent data loss.
 */
export const RawJson = () => Transform(({ obj, key }) => obj?.[key], { toClassOnly: true });
