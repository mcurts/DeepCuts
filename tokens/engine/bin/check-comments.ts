#!/usr/bin/env node
/**
 * check-comments <path…>: enforce standards/code-comments.md. A standalone entry point with
 * no dependencies, so a site repo can vendor just this (sb vendor <dest> --only …) and run
 * it from its lint script.
 */
import { readFileSync } from 'node:fs';
import { checkComments } from '../lib/comments.ts';
import { sources } from '../lib/files.ts';

const args = process.argv.slice(2);
const problems = sources(args.length ? args : ['.']).flatMap((file) =>
  checkComments(readFileSync(file, 'utf8'), file).map((p) => `${file}:${p.line}: ${p.message}`),
);
if (problems.length) {
  console.error([...problems, `✗ ${problems.length} comment problems (standards/code-comments.md)`].join('\n'));
  process.exit(1);
}
console.log('✓ comments follow standards/code-comments.md');
