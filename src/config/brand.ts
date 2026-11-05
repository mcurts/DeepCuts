// Brand copy shared across the app. A "deep cut" is a record's B-side or album track: the songs
// behind the hits. The tagline makes the same promise for films.
//
// Logo.tsx draws it under the artwork. index.html and the web manifest
// (scripts/generate-icons.mjs) can't import this file, so they repeat the tagline; change all
// three together.

/** The line under the logo (Logo's `tagline`), and the second half of the Landing page's title. */
export const TAGLINE = 'The B-sides of cinema'
