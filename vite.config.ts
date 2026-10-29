/// <reference types="vitest/config" />
// Vite configuration: the dev server, the production build, the local TMDB proxy, security
// headers, and the unit-test runner (Vitest reads its settings from `test` below).
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig, loadEnv } from 'vite'
import { lowPriorityScripts } from './server/lowPriorityScripts.ts'
import { preloadFonts } from './server/preloadFonts.ts'
import { baseHeaders, contentSecurityPolicy } from './server/securityHeaders.ts'
import { sonnerStyles } from './server/sonnerStyles.ts'
import { tmdbProxy } from './server/tmdb/proxy.ts'

// Security headers (ADR-0008), defined once in server/securityHeaders.ts. CSP is applied to
// `vite preview` (the production build); the dev server needs inline scripts for React Fast
// Refresh, so it gets the other headers only. HSTS is for the hosted app only (localhost is HTTP).
// Re-exported so the E2E security test checks the exact same values.
export { baseHeaders, contentSecurityPolicy }

// The release version, shown in the footer. `npm run deploy` works it out from git and passes it in
// (ADR-0049); every other build (dev, tests, Storybook, CI) is a `dev` build.
const version = process.env.DEEP_CUTS_VERSION ?? 'dev'

export default defineConfig(({ mode }) => ({
  define: { __APP_VERSION__: JSON.stringify(version) },
  // TMDB_READ_TOKEN is read without the VITE_ prefix, so it never reaches the bundle (ADR-0013).
  plugins: [
    react(),
    tailwindcss(),
    tmdbProxy(loadEnv(mode, process.cwd(), '').TMDB_READ_TOKEN),
    // Keeps Sonner's inline <style> tag out of the build, which the CSP would block.
    sonnerStyles(),
    // Starts the web fonts downloading with the page, so headings don't reflow when they arrive.
    preloadFonts(),
    // Lets the stylesheet and fonts, all the pre-rendered landing page needs, arrive first (ADR-0057).
    lowPriorityScripts(),
    // dist/version.json: the error log reads it to stamp each line with this deploy's version
    // (ADR-0058, server/errorLog.ts). The footer shows the same version.
    {
      name: 'version-file',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version }),
        })
      },
    },
    // `npm run analyze` only: a treemap of what's in the bundle, at build/bundle-report.html.
    mode === 'analyze' &&
      visualizer({ filename: 'build/bundle-report.html', gzipSize: true, template: 'treemap' }),
  ],
  // `@/x` means `src/x`, matching `paths` in tsconfig.app.json. Vitest and Storybook build with this
  // config, so they resolve it too.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { headers: baseHeaders },
  preview: { headers: { ...baseHeaders, 'Content-Security-Policy': contentSecurityPolicy } },
  // Fonts are never inlined as data: URIs, which the CSP's font-src 'self' would block.
  // No source maps in the production build, so the original source isn't published.
  build: {
    sourcemap: false,
    assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
    // Libraries go into three stable files that only change when a library is upgraded, so a
    // returning visitor keeps them cached across app updates. Pages are split by the router.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
            },
            {
              name: 'react-aria',
              // Except drag and drop: only Home's Top Ten reorder mode uses it (ADR-0041), so it
              // stays in that lazy chunk instead of adding ~20 kB to every first visit.
              test: /node_modules[\\/](react-aria|react-aria-components|react-stately|@react-aria|@react-stately|@react-types|@internationalized|@swc)[\\/](?!.*(?:[\\/]dnd[\\/]|[\\/]use(?:Drag|Drop)\.js$))/,
            },
            {
              name: 'data',
              // src/zodConfig.ts rides with Zod, so its setting runs as soon as Zod loads: left
              // in the entry chunk, it ran after the chunks that parse on load, too late.
              test: /node_modules[\\/](zod|@tanstack)[\\/]|src[\\/]zodConfig\.ts$/,
            },
          ],
        },
      },
    },
  },
  // Unit tests (Vitest): a simulated browser (jsdom), shared setup, and which files are tests.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Screen tests drive a whole page through user events; under coverage on a busy machine a few
    // took 5–7 s (Vitest's default limit is 5 s). 15 s still catches a real hang.
    testTimeout: 15_000,
    // Tests check behavior, not styles, so CSS isn't processed (faster).
    css: false,
    // Newer Node versions ship a global localStorage that shadows jsdom's and is unusable without
    // a file; the flag turns it off (harmless where it's already off).
    execArgv: ['--no-experimental-webstorage'],
    // `npm run coverage` fails if tests cover less than these minimums.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts', 'functions/**/*.ts', 'scripts/**/*.ts'],
      exclude: [
        'src/main.tsx',
        // The build-time render of the landing page (ADR-0057), checked by the build and e2e.
        'src/prerender.tsx',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.contract.ts',
        'src/test/**',
        // Storybook stories are documentation, checked by the Storybook a11y gate instead.
        'src/**/*.stories.tsx',
        // Dev-only design labs (router.tsx): prototypes that never ship.
        'src/routes/lab/**',
        'server/**/*.test.ts',
        'scripts/**/*.test.ts',
        'server/**/*.contract.ts',
      ],
      thresholds: {
        lines: 80,
        // Tag rules carry the product's invariants (ADR-0010, ADR-0017).
        'src/domain/tagRules.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
        // The recommendation scorer (ADR-0010, ADR-0026).
        'src/domain/scorer.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  },
}))
