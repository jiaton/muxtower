/**
 * The sizes a fitted pane was given, to keep a fit from fighting itself: a size equal to the last one
 * (or a few rows off) is not sent again, and one that only goes back to the size before it (A, B, A)
 * within BOUNCE_MS is not sent at all, since it is the page and the agent bouncing off each other (the
 * agent redraws for B, which changes the page, which measures A again…), not the view being resized.
 */
export const BOUNCE_MS = 10_000
export const SMALL_ROWS = 2

export interface Size {
  cols: number
  rows: number
}

export class FitGuard {
  private sent: { size: Size; at: number }[] = []

  /** Whether to send `size` now; if so, it is counted as sent. */
  allow(size: Size, now = Date.now()): boolean {
    const last = this.sent.at(-1)
    if (last && last.size.cols === size.cols && Math.abs(last.size.rows - size.rows) <= SMALL_ROWS) return false
    const before = this.sent.at(-2)
    if (before && now - before.at < BOUNCE_MS && before.size.cols === size.cols && before.size.rows === size.rows) return false
    this.sent = [...this.sent.slice(-1), { size, at: now }]
    return true
  }
}
