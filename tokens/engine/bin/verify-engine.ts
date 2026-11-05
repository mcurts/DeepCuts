#!/usr/bin/env node
/**
 * verify-engine [dir]: fail if a vendored copy of the engine (or a slice of it) was edited.
 * Standalone, with no dependencies, so it can ship in a slice next to check-comments.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from '../lib/vendor.ts';

const dir = resolve(process.argv[2] ?? dirname(dirname(fileURLToPath(import.meta.url))));
const problems = verify(dir);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('✓ the vendored engine matches ENGINE.lock');
