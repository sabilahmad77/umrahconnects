import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * The e2e suite resets its database. To make that safe, the database name must
 * end in `_test`. Default: the local development URL with the database renamed
 * to `umrah_connects_test`.
 */
export function resolveTestDatabaseUrl(): string {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const envFile = join(__dirname, '..', '.env');
    const line = existsSync(envFile)
      ? readFileSync(envFile, 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='))
      : undefined;
    const base = line?.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
    if (!base) throw new Error('Set TEST_DATABASE_URL (database name must end in _test)');
    const u = new URL(base);
    u.pathname = '/umrah_connects_test';
    url = u.toString();
  }
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run e2e tests against database "${name}" — the name must end in _test`);
  }
  return url;
}
