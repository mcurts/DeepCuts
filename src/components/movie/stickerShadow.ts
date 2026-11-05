// The genre sticker's shadow (GenreSticker.tsx), in its own module so the component file only
// exports components (React Fast Refresh) and the tests can check it directly.

/**
 * The sticker's shadow, a soft one that always falls downward but sits a little differently for
 * each genre, so a shelf of stickers doesn't look stamped by one machine:
 * 1 to 2.5px down, -1.5 to 1.5px across, from a hash of the genre's slug. Gentler than the
 * old hard 3px stamp: a 1px blur in the shadow color at 55%.
 */
export function stickerShadow(slug: string): string {
  let hash = 0
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const x = ((hash % 7) - 3) * 0.5
  const y = 1 + ((hash >>> 3) % 4) * 0.5
  return `${x}px ${y}px 1px color-mix(in srgb, var(--color-shadow-decorative) 55%, transparent)`
}
