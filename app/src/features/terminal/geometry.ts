/**
 * The terminal's cell geometry, the one source every row, the fit and anything painted take their sizes
 * from: a row is TERM_LINE ems tall, rounded to whole device pixels so that rows tile exactly (a row of
 * 18.2 device px leaves a seam somewhere; 18 or 19 never does). A cell is as wide as the monospace font's
 * advance (`ch`), measured by the terminal view.
 */

/** A row's height, in ems of the terminal's font size, before snapping. */
export const TERM_LINE = 1.5

/** A row's height in CSS px for this font size and device pixel ratio: whole device pixels. */
export function rowPx(fontSize: number, dpr: number): number {
  const ratio = dpr > 0 ? dpr : 1
  return Math.max(1, Math.round(TERM_LINE * fontSize * ratio)) / ratio
}
