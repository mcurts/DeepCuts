/**
 * Finds source files under the given paths for the CLI tools (codemod, check-comments),
 * skipping generated and third-party folders.
 */
import { readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

/** Folders that hold generated or vendored code, never hand-written source. */
export const SKIP = new Set(['node_modules', 'dist', 'out', '.next', 'coverage', 'storybook-static', 'test-results', '.git', 'engine', 'tokens']);

/** Hand-written code files. */
export const CODE = ['.css', '.ts', '.tsx', '.js', '.mjs', '.jsx', '.astro', '.html'];

export function sources(paths: string[], extensions: string[] = CODE): string[] {
  return paths.flatMap((p) => {
    if (statSync(p).isFile()) return [p];
    return readdirSync(p)
      .filter((f) => !SKIP.has(f))
      .flatMap((f) => sources([join(p, f)], extensions))
      .filter((f) => extensions.includes(extname(f)));
  });
}
