import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { GlobalSetupContext } from 'vitest/node';
import { resolveTestDatabaseUrl } from './db-url';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Local storage root of this e2e run (test/env.ts sets STORAGE_LOCAL_DIR to it). */
    e2eStorageDir: string;
  }
}

/**
 * Recreates the disposable test database from the committed migrations (as the owner role) and gives
 * the run its own local-storage directory, removed afterwards: files the suite uploads never land in
 * the worktree's real uploads/ (F8).
 */
export default async function setup({ provide }: GlobalSetupContext) {
  const url = resolveTestDatabaseUrl();
  const cwd = join(__dirname, '..');
  const env = { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' };
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', { cwd, env, stdio: 'pipe' });
  execSync('npx prisma migrate status', { cwd, env, stdio: 'pipe' });

  const storage = mkdtempSync(join(tmpdir(), 'uc-e2e-storage-'));
  provide('e2eStorageDir', storage);
  return () => rmSync(storage, { recursive: true, force: true });
}
