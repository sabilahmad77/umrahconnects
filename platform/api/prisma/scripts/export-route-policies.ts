/**
 * Writes the live route → access-policy inventory (from Nest metadata, not from source parsing).
 *   ts-node prisma/scripts/export-route-policies.ts <out.json>
 */
import { writeFileSync } from 'fs';
import { withAppContext } from './app-context';
import { AccessPolicyCheck } from '../../src/modules/rbac/access-policy.check';

const out = process.argv[2] ?? 'route-policies.json';
withAppContext(async (app) => {
  const routes = app.get(AccessPolicyCheck).inventory().sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  const summary = routes.reduce<Record<string, number>>((acc, r) => ((acc[r.policy] = (acc[r.policy] ?? 0) + 1), acc), {});
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), total: routes.length, summary, routes }, null, 2));
  console.log(`${routes.length} routes → ${out}`, summary);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
