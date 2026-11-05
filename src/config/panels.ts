// The app's three ideas, in the order the landing page's program and Home's shelves present them
//: Top Ten, Watchlist and Discovery. One definition, so the two
// pages can't drift apart in name or order.

/** Which of the three ideas. */
export type PanelId = 'top-ten' | 'watchlist' | 'discovery'

/** One idea: its id and its heading. */
export interface PanelDef {
  id: PanelId
  title: string
}

/** The three ideas, in page order ("Feature Nº 1" to "Nº 3"). */
export const PANELS: Record<PanelId, PanelDef> = {
  'top-ten': { id: 'top-ten', title: 'Your Top Ten of All Time' },
  watchlist: { id: 'watchlist', title: 'My Watchlist' },
  discovery: { id: 'discovery', title: 'Discover Some Deep Cuts' },
}
