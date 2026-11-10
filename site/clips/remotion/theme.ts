/** What every part of the finished clip shares: the site's colors, the easing, the picture's size. */
import { Easing } from 'remotion'
import type { ClipEvent } from '../clip.ts'

/** The site's colors (app/src/styles/tokens.css, light). */
export const C = {
  bg: '#f6f7f9',
  fg: '#16191f',
  muted: '#5d6370',
  accent: '#1a6fd6',
  frame: '#1d1f24',
  border: '#dfe2e7',
}

/** 16:9, sized for the site: shrunk to a phone's width, the captions still read. */
export const SIZE = { width: 1920, height: 1080 } as const
export const CAPTION_BAND = 150

export const ease = Easing.bezier(0.33, 0, 0.2, 1)
export const MOVE = 0.7 // seconds the cursor travels before a click
export const CAMERA = 0.8 // seconds the camera takes to get somewhere

/** The events of one kind, in order. */
export const only = <K extends ClipEvent['kind']>(events: ClipEvent[], kind: K) =>
  events.filter((e): e is Extract<ClipEvent, { kind: K }> => e.kind === kind)

/** A 0→1→0 fade: in over `fade` s from `from`, out over `fade` s after `to`. */
export const shown = (t: number, from: number, to: number, fade = 0.3) => Math.max(0, Math.min(1, (t - from) / fade, 1 - (t - to) / fade))
