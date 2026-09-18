import type { PrismaClient } from '@prisma/client';
import type { RbacService } from '../../../src/modules/rbac/rbac.service';
import { QA_FIXTURE } from './fixtures';
import { writeCredentials, type QaCredential } from './credentials';
import { ensureQaIdentities, ensureQaOrganizations } from './identities';
import { seedQaDomainData } from './domain-data';

export interface SeedQaOptions {
  database: string;
  credentialsPath: string;
  rotate?: boolean;
  identitiesOnly?: boolean;
}

/**
 * Organizations → identities → credential file → domain data. The credential
 * file is written before the domain data, so a failure there never loses the
 * passwords that were just issued.
 */
export async function seedQaFixtures(prisma: PrismaClient, rbac: RbacService, opts: SeedQaOptions): Promise<{ credentials: QaCredential[]; domain: string[] }> {
  const orgs = await ensureQaOrganizations(prisma);
  const { credentials, users } = await ensureQaIdentities(prisma, rbac, orgs, opts);
  writeCredentials(opts.credentialsPath, {
    fixture: QA_FIXTURE,
    warning: 'Local QA fixture accounts only. Never commit, share or use these outside a local development database.',
    generatedAt: new Date().toISOString(),
    database: opts.database,
    identities: credentials,
  });
  const domain = opts.identitiesOnly ? [] : await seedQaDomainData(prisma, orgs, users);
  return { credentials, domain };
}
