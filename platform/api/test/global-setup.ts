import { execSync } from 'child_process';
import { join } from 'path';
import { resolveTestDatabaseUrl } from './db-url';

/** Recreates the disposable test database from the committed migrations (as the owner role). */
export default async function setup() {
  const url = resolveTestDatabaseUrl();
  const cwd = join(__dirname, '..');
  const env = { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' };
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', { cwd, env, stdio: 'pipe' });
  execSync('npx prisma migrate status', { cwd, env, stdio: 'pipe' });
}
