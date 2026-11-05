// Build-time settings the app reads from `import.meta.env` (Vite). None of them is a secret:
// everything here ends up in the public JavaScript.
/** The release version (`1.2.0`), or `dev` outside a deploy; set by `define` in vite.config.ts. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** `cloudflare` selects real passkey accounts; unset keeps the local mock. */
  readonly VITE_ACCOUNTS?: 'cloudflare'
}
