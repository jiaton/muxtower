/** What a recording leaves for the finishing pass (`remotion/`): the frames, and what happened when. */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Something that happened in the recording, at `t` seconds from its start. Positions and rectangles are
 *  in CSS pixels of the page. */
export type ClipEvent =
  | { t: number; kind: 'caption'; text: string }
  /** What the reader should look at: the camera moves to it; null pulls back to the whole screen. */
  | { t: number; kind: 'focus'; rect: Rect | null }
  /** A tap or a click: the cursor is there at `t`. */
  | { t: number; kind: 'click'; x: number; y: number }
  /** Words spoken aloud (the clip is muted): shown as a speech bubble from `t` for `ms`. */
  | { t: number; kind: 'say'; text: string; ms: number }
  /** A browser an agent drives, staged (no real browser): drawn over `rect` from `t` for `ms`. */
  | { t: number; kind: 'browser'; ms: number; rect: Rect; label: string; url: string }
  /** Words typed, from `t` for `ms`. */
  | { t: number; kind: 'type'; x: number; y: number; ms: number }

export interface ClipMeta {
  id: string
  /** `phone` gets a phone frame and a tap mark; `desktop` a window and an arrow cursor. */
  frame: 'phone' | 'desktop'
  viewport: { width: number; height: number }
  dpr: number
  fps: number
  /** The image shown in each output frame, by file name under `raw/<id>/`. */
  frames: string[]
  events: ClipEvent[]
}
