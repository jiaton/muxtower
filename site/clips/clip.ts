/** What a recording leaves for the finishing pass (`remotion/`): each screen's frames, where each sits in
 *  the 16:9 picture, and what happened when. */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Something that happened in the recording, at `t` seconds from its start. Positions and rectangles are
 *  in CSS pixels of the page of `view` (the clip's first view when left out). */
export type ClipEvent =
  | { t: number; kind: 'caption'; text: string }
  /** What the reader should look at: the camera moves to it; null pulls back to the whole screen. */
  | { t: number; kind: 'focus'; view?: string; rect: Rect | null }
  /** A tap or a click: the cursor is there at `t`. */
  | { t: number; kind: 'click'; view?: string; x: number; y: number }
  /** A finger held down at `t` for `ms` (a long press). */
  | { t: number; kind: 'press'; view?: string; x: number; y: number; ms: number }
  /** A finger (or the mouse, held) pressed at `x`, `y` at `t`, dragged `dx`, `dy` over `ms`, and lifted. */
  | { t: number; kind: 'swipe'; view?: string; x: number; y: number; dx: number; dy?: number; ms: number }
  /** Words typed, from `t` for `ms`. */
  | { t: number; kind: 'type'; view?: string; x: number; y: number; ms: number }
  /** Words spoken aloud (the clip is muted): shown as a speech bubble from `t` for `ms`, by `view`. */
  | { t: number; kind: 'say'; view?: string; text: string; ms: number }
  /** A browser an agent drives, staged (no real browser): drawn over `rect` from `t` for `ms`. */
  | { t: number; kind: 'browser'; view?: string; ms: number; rect: Rect; label: string; url: string }
  /** Work handed from one row to another (a teammate's task): an arrow between them, with `label`. */
  | { t: number; kind: 'arrow'; view?: string; from: Rect; to: Rect; label: string; ms: number }
  /** A machine's part of the screen (its group of rows, top to bottom): a bracket beside the window, named. */
  | { t: number; kind: 'machine'; view?: string; rect: Rect; label: string; note?: string }
  /** A key pressed, shown as a key cap (`label`, e.g. "⏎ Enter"). */
  | { t: number; kind: 'key'; label: string }
  /** A line that appears in the drawn terminal. */
  | { t: number; kind: 'term'; text: string; tone?: 'prompt' | 'out' | 'dim' | 'ok' | 'work' }

/** One screen recorded: its frames are files under `raw/<clip>/<name>/`. */
export interface ViewMeta {
  name: string
  /** `phone` gets a phone frame and a finger; `desktop` a browser window and an arrow cursor. */
  kind: 'phone' | 'desktop'
  viewport: { width: number; height: number }
  frames: string[]
}

/** Where a thing sits in the 1920×1080 picture: its outer box's top left, and its height there (a
 *  screen's width follows from its page's shape). Later layers lie on top. */
export type Layer =
  /** `still`: the camera does not move in to what the script points at (the spotlight alone points). */
  | { view: string; x: number; y: number; height: number; url?: string; still?: boolean }
  /** A terminal window, drawn (no real terminal), showing the clip's `term` lines. */
  | { terminal: string; x: number; y: number; width: number; height: number }

export interface ClipMeta {
  id: string
  dpr: number
  fps: number
  /** Output frames: every view has this many. */
  length: number
  views: ViewMeta[]
  layers: Layer[]
  events: ClipEvent[]
}
