import { useLayoutDrawer } from '@/lib/layout-drawer'
import { useLayoutPrefs } from '@/lib/layout-prefs'

/**
 * The sizes a fitted pane was given, to keep a fit from fighting itself: a size equal to the last one
 * (or a few rows off) is not sent again, and one that only goes back to the size before it (A, B, A)
 * within BOUNCE_MS is not sent at all, since it is the page and the agent bouncing off each other (the
 * agent redraws for B, which changes the page, which measures A again…), not the view being resized.
 * That bounce is only ever content's doing (a scrollbar coming and going): a fit for a frame change
 * (`watchFrame`: the window, full screen, the layout…) forgets the sizes before, so full screen and back
 * within BOUNCE_MS fits both ways.
 */
export const BOUNCE_MS = 10_000
export const SMALL_ROWS = 2

/** Why a fit was measured: the frame around the view changed (`watchFrame`), or only what is in it. */
export type FitCause = 'frame' | 'content'

export interface Size {
  cols: number
  rows: number
}

export class FitGuard {
  private sent: { size: Size; at: number }[] = []

  /** Whether to send `size` now; if so, it is counted as sent. `cause` 'frame': the view was resized on
   *  purpose, so going back to the size before is no bounce. */
  allow(size: Size, now = Date.now(), cause: FitCause = 'content'): boolean {
    if (cause === 'frame') this.sent = this.sent.slice(-1)
    const last = this.sent.at(-1)
    if (last && last.size.cols === size.cols && Math.abs(last.size.rows - size.rows) <= SMALL_ROWS) return false
    const before = this.sent.at(-2)
    if (before && now - before.at < BOUNCE_MS && before.size.cols === size.cols && before.size.rows === size.rows) return false
    this.sent = [...this.sent.slice(-1), { size, at: now }]
    return true
  }
}

/**
 * The height a pane is fitted to: the tallest the view has been in this frame, which is its height without
 * what comes and goes around it (the soft keyboard, the Live row, quotes and pictures in the message box,
 * the + panel, a banner, a draft of several lines). Those never resize the pane (Claude Code would clear
 * and redraw its whole screen); the view just gets shorter, pinned to its bottom, and scrolls. A new frame
 * starts again from its own height: on a touch screen a new width (rotation, a fold opened; the keyboard
 * changes the window's height there, so the height cannot say), elsewhere a new width or window size
 * (`frameOf`).
 */
export class StableHeight {
  private frame = ''
  private tallest = 0

  height(frame: string, height: number): number {
    if (frame !== this.frame) [this.frame, this.tallest] = [frame, height]
    else this.tallest = Math.max(this.tallest, height)
    return this.tallest
  }
}

/** What a pane's fitted height is kept for: the view's width, and on a screen with a mouse the window's
 *  size too (resizing the window is a real change; on a phone the keyboard resizes it, which is not). */
/** `epoch` counts full screens entered and left (`watchFrame`): on a touch screen that changes only the
 *  height, which the keyboard changes too, so the frame is told by it. */
export const frameOf = (width: number, touch: boolean, window: { innerWidth: number; innerHeight: number }, epoch = 0) =>
  touch ? `${width} #${epoch}` : `${width} ${window.innerWidth}x${window.innerHeight} #${epoch}`

/** A deliberate change of the frame around a terminal view. */
export type FrameChange = 'resize' | 'fullscreen' | 'rotation' | 'layout' | 'drawer'

/**
 * Calls `onChange` on every deliberate change of the frame a view sits in: the window or viewport
 * resized, full screen entered or left, the device rotated, the layout switched (`useLayoutPrefs`) or the
 * drawer opened or closed (`useLayoutDrawer`). The view refits once things settle, whatever its size was
 * before. Returns the unsubscribe.
 */
export function watchFrame(onChange: (change: FrameChange) => void): () => void {
  const resize = () => onChange('resize')
  const fullscreen = () => onChange('fullscreen')
  const rotation = () => onChange('rotation')
  window.addEventListener('resize', resize)
  window.visualViewport?.addEventListener('resize', resize)
  document.addEventListener('fullscreenchange', fullscreen)
  document.addEventListener('webkitfullscreenchange', fullscreen)
  screen.orientation?.addEventListener?.('change', rotation)
  const layout = useLayoutPrefs.subscribe((s, prev) => s.layout !== prev.layout && onChange('layout'))
  const drawer = useLayoutDrawer.subscribe((s, prev) => s.open !== prev.open && onChange('drawer'))
  return () => {
    window.removeEventListener('resize', resize)
    window.visualViewport?.removeEventListener('resize', resize)
    document.removeEventListener('fullscreenchange', fullscreen)
    document.removeEventListener('webkitfullscreenchange', fullscreen)
    screen.orientation?.removeEventListener?.('change', rotation)
    layout()
    drawer()
  }
}

/** The diagnostic line a fit logs: its size and why. */
export const fitLine = (size: Size, cause: FitCause, change?: FrameChange) =>
  `fitted to ${size.cols}x${size.rows} (${cause === 'frame' ? `frame: ${change ?? 'resize'}` : 'content'})`

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
