import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { randomInt } from 'crypto';

/**
 * The local QA credential file: one random password per fixture identity,
 * written with mode 0600 into the git-ignored `.project/local/` directory.
 * Passwords never go to stdout or to any log.
 */

export interface QaCredential {
  key: string;
  email: string;
  role: string;
  organization: string;
  organizationSlug: string;
  emailVerified: boolean;
  purpose: string;
  password: string;
}

export interface QaCredentialFile {
  fixture: string;
  warning: string;
  generatedAt: string;
  database: string;
  identities: QaCredential[];
}

/** The monorepo root: the nearest ancestor holding pnpm-workspace.yaml. */
export function repoRoot(start = __dirname): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Could not find the repository root (pnpm-workspace.yaml).');
    dir = parent;
  }
}

export function defaultCredentialsPath(): string {
  return join(repoRoot(), '.project', 'local', 'qa-credentials.json');
}

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SYMBOL = '-_.!@#%+=';
const ALL = LOWER + UPPER + DIGIT + SYMBOL;

/**
 * 24 characters from crypto.randomInt (unbiased), always containing a lower- and
 * upper-case letter, a digit and a symbol — comfortably inside the 8–128 policy.
 * Ambiguous characters (0/O, 1/l/I) are left out so a tester can read it.
 */
export function generatePassword(length = 24): string {
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Previously issued passwords by email (lower-case). A missing or unreadable file is simply empty. */
export function readCredentials(path: string): Map<string, string> {
  const known = new Map<string, string>();
  if (!existsSync(path)) return known;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<QaCredentialFile>;
    for (const entry of parsed.identities ?? []) {
      if (entry?.email && typeof entry.password === 'string') known.set(entry.email.toLowerCase(), entry.password);
    }
  } catch {
    // A damaged file only means every password is issued afresh.
  }
  return known;
}

/** Atomic write (temp file + rename), directory 0700, file 0600 — even when the file already existed. */
export function writeCredentials(path: string, file: QaCredentialFile): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
  chmodSync(path, 0o600);
}
