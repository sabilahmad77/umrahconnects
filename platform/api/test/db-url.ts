import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function envFileValue(key: string): string | undefined {
  const envFile = join(__dirname, '..', '.env');
  if (!existsSync(envFile)) return undefined;
  const line = readFileSync(envFile, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).replace(/^"|"$/g, '') || undefined;
}

/**
 * The e2e suite resets its database. To make that safe, the database name must
 * end in `_test`. Default: the local development URL with the database renamed
 * to `umrah_connects_test`. This is the OWNER connection: it runs the migrations
 * and the fixtures/assertions of the tests (it bypasses Row-Level Security).
 */
export function resolveTestDatabaseUrl(): string {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const base = envFileValue('MIGRATE_DATABASE_URL') ?? envFileValue('DATABASE_URL');
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

/**
 * The connection the API under test uses — the non-superuser runtime role, so
 * Row-Level Security is exercised by every e2e test (R05). Order:
 *  1. TEST_APP_DATABASE_URL;
 *  2. the credentials of `.env` DATABASE_URL (the local runtime role, see
 *     prisma/rls/runtime-role.sql) on the test database, when they differ from the owner's;
 *  3. the owner URL — RLS is then NOT exercised and test/rls.e2e-spec.ts fails loudly.
 */
export function resolveAppDatabaseUrl(): string {
  const owner = new URL(resolveTestDatabaseUrl());
  const explicit = process.env.TEST_APP_DATABASE_URL;
  if (explicit) {
    if (new URL(explicit).pathname !== owner.pathname) {
      throw new Error('TEST_APP_DATABASE_URL must point at the same _test database as TEST_DATABASE_URL');
    }
    return explicit;
  }
  const runtime = envFileValue('DATABASE_URL');
  if (runtime) {
    const r = new URL(runtime);
    if (r.username && r.username !== owner.username) {
      const u = new URL(owner.toString());
      u.username = r.username;
      u.password = r.password;
      return u.toString();
    }
  }
  return owner.toString();
}
