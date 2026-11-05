/**
 * Engine distribution (standards/design-tokens.md §7). Each site keeps a byte-identical
 * copy of the engine. ENGINE.lock records the engine version and a SHA-256 for every
 * file, and verify() fails if a copy was edited by hand, so the copies can't drift.
 *
 * The engine is vendored, not installed: the sites have no shared registry, and a git
 * dependency on a private repo would break their CI. With a registry, swap the copy for
 * a dependency and keep verify() as the integrity check.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export const LOCK = 'ENGINE.lock';

/** What gets vendored: the code a site runs, never tests or tooling config. */
export const VENDORED = ['lib', 'bin', 'package.json', 'README.md'];

export interface Lock {
  name: string;
  version: string;
  files: Record<string, string>;
}

const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

/** Hash every vendored file under `root`. */
export function hashTree(root: string, only: string[] = VENDORED): Record<string, string> {
  const files = only.flatMap((entry) => {
    const p = join(root, entry);
    if (!existsSync(p)) return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  return Object.fromEntries(files.map((f) => [relative(root, f), sha256(f)]));
}

/** Copy the engine at `engineDir` into `dest` (replacing what's there) and write the lock. */
export function vendor(engineDir: string, dest: string, only: string[] = VENDORED): Lock {
  const pkg = JSON.parse(readFileSync(join(engineDir, 'package.json'), 'utf8')) as { name: string; version: string };
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const entry of only) {
    const from = join(engineDir, entry);
    mkdirSync(dirname(join(dest, entry)), { recursive: true });
    cpSync(from, join(dest, entry), { recursive: true });
  }
  const lock: Lock = { name: pkg.name, version: pkg.version, files: hashTree(dest, only) };
  writeFileSync(join(dest, LOCK), `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

/** Problems with a vendored copy: edited, missing or extra files. Empty means it matches its lock. */
export function verify(dest: string): string[] {
  const lockFile = join(dest, LOCK);
  if (!existsSync(lockFile)) return [`${dest} has no ${LOCK}; vendor the engine with \`sb vendor\`.`];
  const lock = JSON.parse(readFileSync(lockFile, 'utf8')) as Lock;
  const roots = [...new Set(Object.keys(lock.files).map((f) => f.split('/')[0]!))];
  const actual = hashTree(dest, roots);
  const problems: string[] = [];
  for (const [file, hash] of Object.entries(lock.files)) {
    if (!actual[file]) problems.push(`${file} is missing.`);
    else if (actual[file] !== hash) problems.push(`${file} was edited; change the engine in site-builder and re-vendor.`);
  }
  for (const file of Object.keys(actual)) if (!lock.files[file]) problems.push(`${file} isn't part of ${lock.name}@${lock.version}.`);
  return problems;
}
