// The storage key for the chosen theme (ADR-0056), on its own with no imports so the token build
// (sd.config.mjs, plain Node) can read it to write the boot script. LocalThemePreference uses it
// for the app's reads and writes; keeping one source means the two can never disagree.

/** The key under the app's storage prefix (versionedStore's STORAGE_PREFIX): `deepcuts:v1:theme`. */
export const THEME_KEY = 'theme'
