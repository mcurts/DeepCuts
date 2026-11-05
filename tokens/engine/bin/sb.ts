#!/usr/bin/env node
/**
 * The site-builder engine CLI. Runs TypeScript directly, so it needs Node 22.18+ (type stripping on by default).
 *
 *   sb build [dir]                          build the token package in dir (default: cwd)
 *   sb codemod <renames.json> <path…>       apply a rename map (--mode css-var | word | tailwind;
 *                                           --ext .md,.json to also reach docs and specs)
 *   sb check-comments <path…>               enforce standards/code-comments.md
 *   sb vendor <dest> [--only lib,bin]       copy this engine into a site (run from site-builder)
 *   sb verify-engine [dir]                  fail if a vendored copy was edited (default: this copy)
 *
 * Every command exits non-zero on a problem, so each one can gate CI.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, GateError } from '../lib/build.ts';
import { applyRenames, type CodemodMode } from '../lib/codemod.ts';
import { checkComments } from '../lib/comments.ts';
import { CODE, sources } from '../lib/files.ts';
import { vendor, verify } from '../lib/vendor.ts';

const here = dirname(dirname(fileURLToPath(import.meta.url)));
const [command, ...args] = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};

const fail = (lines: string[]) => {
  for (const l of lines) console.error(l);
  process.exit(1);
};

switch (command) {
  case 'build': {
    const root = resolve(args[0] ?? '.');
    try {
      const { files, contrast, warnings } = await build({ root, outDir: join(root, 'dist') });
      for (const w of warnings) console.warn(`warning: ${w}`);
      const tightest = [...contrast.results].sort((a, b) => a.ratio - a.min - (b.ratio - b.min))[0];
      console.log(`✓ ${contrast.results.length} contrast pairings pass${tightest ? ` (tightest: ${tightest.foreground} on ${tightest.background}, ${tightest.ratio}:1 vs ${tightest.min}:1, ${tightest.set})` : ''}`);
      console.log(`✓ wrote ${files.length} files to ${join(root, 'dist')}`);
    } catch (e) {
      if (e instanceof GateError) fail([e.message]);
      throw e;
    }
    break;
  }
  case 'codemod': {
    const mode = (flag('mode') ?? 'css-var') as CodemodMode;
    const extensions = flag('ext')?.split(',');
    const [mapFile, ...paths] = args;
    if (!mapFile || paths.length === 0) fail(['usage: sb codemod <renames.json> <path…> [--mode css-var|word|tailwind] [--ext .md,.json]']);
    const renames = JSON.parse(readFileSync(mapFile!, 'utf8')) as Record<string, string>;
    let total = 0;
    for (const file of sources(paths, extensions ? [...CODE, ...extensions] : CODE)) {
      const { text, count } = applyRenames(readFileSync(file, 'utf8'), renames, mode);
      if (count) {
        writeFileSync(file, text);
        console.log(`${count.toString().padStart(4)}  ${file}`);
        total += count;
      }
    }
    console.log(`✓ ${total} renames`);
    break;
  }
  case 'check-comments': {
    const problems = sources(args.length ? args : ['.']).flatMap((file) =>
      checkComments(readFileSync(file, 'utf8'), file).map((p) => `${file}:${p.line}: ${p.message}`),
    );
    if (problems.length) fail([...problems, `✗ ${problems.length} comment problems (standards/code-comments.md)`]);
    console.log('✓ comments follow standards/code-comments.md');
    break;
  }
  case 'vendor': {
    const only = flag('only')?.split(',');
    if (!args[0]) fail(['usage: sb vendor <dest> [--only lib,bin]']);
    const lock = vendor(here, resolve(args[0]!), only);
    console.log(`✓ vendored ${lock.name}@${lock.version} (${Object.keys(lock.files).length} files) to ${args[0]}`);
    break;
  }
  case 'verify-engine': {
    const problems = verify(resolve(args[0] ?? here));
    if (problems.length) fail(problems);
    console.log('✓ the vendored engine matches ENGINE.lock');
    break;
  }
  default:
    fail(['usage: sb <build | codemod | check-comments | vendor | verify-engine> …  (see bin/sb.ts)']);
}
