/**
 * O04 — orphaned stored-object cleanup (Nest application context CLI).
 *
 *   Dry run (default; deletes nothing):
 *     pnpm --filter @umrah-connects/api storage:cleanup-orphans
 *   Delete orphans older than 7 days:
 *     pnpm --filter @umrah-connects/api storage:cleanup-orphans -- --apply
 *   Compiled image (production requires the explicit flag):
 *     node dist/src/modules/storage/cleanup/orphan-cleanup.cli.js --apply --allow-production
 *
 * Options:
 *   --apply                      delete the orphans (otherwise report only)
 *   --grace-hours=<n>            keep objects younger than n hours (default 168, minimum 1)
 *   --max-deletions=<n>          at most n deletions per run (default 1000)
 *   --allow-production           required when NODE_ENV=production
 *   --allow-empty-reference-set  delete even though the database mentions no object at all
 *   --json                       print the full report as JSON (default: summary + one line per object)
 *
 * Exit codes: 0 done, 1 error or some deletions failed, 2 refused (nothing deleted).
 */
import { NestFactory } from '@nestjs/core';
import { OrphanCleanupModule } from './orphan-cleanup.module';
import {
  assertMayRun,
  CleanupRefusedError,
  DEFAULT_GRACE_HOURS,
  DEFAULT_MAX_DELETIONS,
  OrphanCleanupOptions,
  OrphanCleanupReport,
  OrphanCleanupService,
} from './orphan-cleanup.service';

export interface CliArgs extends OrphanCleanupOptions {
  json: boolean;
  help: boolean;
}

export function parseCleanupArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    apply: false,
    graceHours: DEFAULT_GRACE_HOURS,
    maxDeletions: DEFAULT_MAX_DELETIONS,
    allowProduction: false,
    allowEmptyReferenceSet: false,
    json: false,
    help: false,
  };
  for (const raw of argv) {
    if (raw === '--') continue;
    const [flag, value] = raw.split('=', 2);
    const num = () => {
      const n = Number(value);
      if (value === undefined || !Number.isFinite(n)) throw new CleanupRefusedError(`${flag} needs a number, e.g. ${flag}=24`);
      return n;
    };
    switch (flag) {
      case '--apply': args.apply = true; break;
      case '--grace-hours': args.graceHours = num(); break;
      case '--max-deletions': args.maxDeletions = num(); break;
      case '--allow-production': args.allowProduction = true; break;
      case '--allow-empty-reference-set': args.allowEmptyReferenceSet = true; break;
      case '--json': args.json = true; break;
      case '--help': case '-h': args.help = true; break;
      default: throw new CleanupRefusedError(`Unknown option ${raw}. Use --help.`);
    }
  }
  return args;
}

function printReport(report: OrphanCleanupReport, json: boolean) {
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  const lines = [
    `orphan-cleanup ${report.mode} (driver ${report.driver}, grace ${report.graceHours}h)`,
    `scanned ${report.scannedObjects} object(s); database references ${report.referencedNames} name(s)`,
    `kept: ${report.kept.referenced} referenced, ${report.kept['too-recent']} within grace, ${report.kept['unrecognised-name']} not written by the platform`,
    ...report.orphans.map((o) => `${report.mode === 'apply' ? 'orphan' : 'would delete'} ${o.visibility} ${o.storageKey} (${o.sizeBytes} B, ${o.lastModified})`),
    ...report.deleted.map((o) => `deleted ${o.visibility} ${o.storageKey}`),
    ...report.failed.map((o) => `FAILED ${o.storageKey}: ${o.error}`),
    report.mode === 'apply'
      ? `deleted ${report.deleted.length}, failed ${report.failed.length}, reclaimed ${report.bytesReclaimed} B${report.truncated ? ' (more remain — run again)' : ''}`
      : `${report.orphans.length} orphan(s) would be deleted${report.truncated ? ' (more remain beyond --max-deletions)' : ''}. Re-run with --apply to delete.`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function main() {
  let args: CliArgs;
  try {
    args = parseCleanupArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write('See the header of orphan-cleanup.cli.ts for usage.\n');
      return 0;
    }
    // Checked before connecting to anything.
    assertMayRun(process.env, args);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 2;
  }

  const app = await NestFactory.createApplicationContext(OrphanCleanupModule, { logger: ['error', 'warn'] });
  try {
    const report = await app.get(OrphanCleanupService).run(args);
    printReport(report, args.json);
    return report.failed.length ? 1 : 0;
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return err instanceof CleanupRefusedError ? 2 : 1;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${(err as Error)?.stack ?? err}\n`);
      process.exit(1);
    },
  );
}
