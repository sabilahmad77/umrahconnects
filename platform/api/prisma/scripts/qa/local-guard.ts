/**
 * Refuses to let a local QA fixture script touch anything that might be a real
 * database. Checked BEFORE any connection is opened (the Nest context would
 * already write the capability catalogue on boot).
 *
 * Allowed only when ALL of these hold:
 *  - NODE_ENV is not "production";
 *  - DATABASE_URL points at a loopback host (localhost, 127.0.0.1, ::1);
 *  - the database name looks like a local development/test database:
 *      umrah_eng100_<worker>[_test], umrah_connects_<integration|core|test|dev|local|qa>[_test],
 *      or any name with a _dev, _local, _test, _qa or _e2e part.
 *    The canonical local database `umrah_connects` shares its name with
 *    production, so it is only accepted when QA_SEED_ALLOW_DATABASE names it
 *    exactly (and the host is still loopback).
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);
const LOCAL_NAME_PATTERNS = [
  /^umrah_eng100_[a-z0-9]+(_test)?$/,
  /^umrah_connects_(integration|core|test|dev|local|qa)(_test)?$/,
  /(^|_)(dev|development|local|test|qa|e2e)(_|$)/,
];

export interface LocalDatabase {
  host: string;
  database: string;
}

export function assertLocalQaDatabase(env: NodeJS.ProcessEnv): LocalDatabase {
  if ((env.NODE_ENV ?? '').trim().toLowerCase() === 'production') {
    throw new Error('Refusing to seed QA fixtures: NODE_ENV is production.');
  }
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error('Refusing to seed QA fixtures: DATABASE_URL is not set.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Refusing to seed QA fixtures: DATABASE_URL is not a valid URL.');
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    throw new Error('Refusing to seed QA fixtures: DATABASE_URL is not a PostgreSQL URL.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!LOOPBACK.has(host)) {
    throw new Error(`Refusing to seed QA fixtures: database host "${host || '(none)'}" is not a local loopback address.`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const looksLocal = LOCAL_NAME_PATTERNS.some((pattern) => pattern.test(database));
  if (!looksLocal && (env.QA_SEED_ALLOW_DATABASE ?? '') !== database) {
    throw new Error(
      `Refusing to seed QA fixtures: database "${database}" does not look like a local development or test ` +
        'database. Set QA_SEED_ALLOW_DATABASE to exactly that name to allow a local database deliberately.',
    );
  }
  return { host, database };
}
