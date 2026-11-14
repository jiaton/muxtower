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

/**
 * The height a pane is fitted to. On a touch screen it is the tallest the view has been at this width,
 * which is its height with the soft keyboard closed: the keyboard opening and closing never resizes the
 * pane (Claude Code would clear and redraw its whole screen for it), the view just gets shorter, pinned
 * to its bottom, and scrolls. A new width (rotation, a real resize) starts again from its own height.
 * With a mouse and keyboard the height is the height.
 */
export class KeyboardProofHeight {
  private width = -1
  private tallest = 0

  height(width: number, height: number, touch: boolean): number {
    if (!touch) return height
    if (width !== this.width) [this.width, this.tallest] = [width, height]
    else this.tallest = Math.max(this.tallest, height)
    return this.tallest
  }
}

/** Shown after a fit, until the agent has redrawn: the screen before it, while the new one is mostly
 *  blank (the agent clears before it paints), for at most HOLD_MS. */
export const HOLD_MS = 500
const VISIBLE_MIN = 20 // fewer visible characters than this: a screen cleared, not yet painted

/** Characters a reader would see in an ANSI screen (escape sequences and white space left out). */
export function visibleChars(ansi: string): number {
  // eslint-disable-next-line no-control-regex
  return ansi.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g, '').replace(/\s/g, '').length
}

/** What to draw: `next`, unless a fit is being held (`held`, until `until`) and `next` is mostly blank. */
export function heldScreen(next: string | undefined, held: { screen: string | undefined; until: number } | null, now: number) {
  if (!held || now >= held.until || next === undefined) return next
  return visibleChars(next) < VISIBLE_MIN && held.screen !== undefined ? held.screen : next
}
