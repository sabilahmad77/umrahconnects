/**
 * LOCAL QA ONLY — Engineering 100 fixture identities and domain data.
 *
 *   cd platform/api && npx ts-node prisma/scripts/seed-qa-identities.ts [--rotate] [--identities-only]
 *
 * - Refuses NODE_ENV=production, non-loopback hosts and database names that do
 *   not look like a local dev/test database (see qa/local-guard.ts).
 * - Creates or resets the fixture organizations (metadata.fixture =
 *   "engineering-100-local-qa") and identities (@qa.umrahconnect.test), one
 *   random strong password each, written with mode 0600 to
 *   <repo>/.project/local/qa-credentials.json (git-ignored) or QA_CREDENTIALS_PATH.
 *   Passwords are never printed. Existing passwords are kept while they still
 *   match; --rotate issues new ones.
 * - Seeds synthetic, internally consistent domain data for every fixture
 *   organization (qa/domain-data.ts) unless --identities-only is given.
 * - Idempotent: re-running converges on the same state.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Load .env.local then .env exactly like the API's ConfigModule (process env wins),
// so the guard below checks the same DATABASE_URL the application context will use.
for (const file of ['.env.local', '.env']) {
  const path = join(__dirname, '..', '..', file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

import { assertLocalQaDatabase } from './qa/local-guard';

let target: { host: string; database: string };
try {
  target = assertLocalQaDatabase(process.env);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

import { withAppContext } from './app-context';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { seedQaFixtures } from './qa/seed';
import { defaultCredentialsPath } from './qa/credentials';

const args = new Set(process.argv.slice(2));
const credentialsPath = process.env.QA_CREDENTIALS_PATH || defaultCredentialsPath();

withAppContext(async (app) => {
  const summary = await seedQaFixtures(app.get(PrismaService), app.get(RbacService), {
    database: target.database,
    credentialsPath,
    rotate: args.has('--rotate'),
    identitiesOnly: args.has('--identities-only'),
  });
  console.log(`QA fixtures ready in database "${target.database}" (${target.host}).`);
  for (const c of summary.credentials) {
    console.log(`  ${c.role.padEnd(18)} ${c.email.padEnd(42)} ${c.organization}${c.emailVerified ? '' : '  [email NOT verified]'}`);
  }
  for (const line of summary.domain) console.log(`  ${line}`);
  console.log(`Passwords (mode 0600, never printed): ${credentialsPath}`);
}).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
