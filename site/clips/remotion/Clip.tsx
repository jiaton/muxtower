/** One finished clip: the recorded screen in a phone or a window, the camera moving to where things
 *  happen, a cursor or tap mark that goes where the script clicked, and a one-line caption per step. */
import '@fontsource-variable/geist'
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import type { ClipEvent, ClipMeta, Rect } from '../clip.ts'

export interface ClipProps {
  meta: ClipMeta
  [key: string]: unknown
}

/** The site's colors (app/src/styles/tokens.css, light). */
const C = {
  bg: '#f6f7f9',
  fg: '#16191f',
  muted: '#5d6370',
  accent: '#1a6fd6',
  frame: '#1d1f24',
  border: '#dfe2e7',
}

/** Output sizes: a phone stands; a window lies. */
export const SIZE = { phone: { width: 720, height: 1280 }, desktop: { width: 1280, height: 860 } } as const

const ease = Easing.bezier(0.33, 0, 0.2, 1)
const MOVE = 0.7 // seconds the cursor travels before a click
const CAMERA = 0.8 // seconds the camera takes to get somewhere

export function Clip({ meta }: ClipProps) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames, width, height } = useVideoConfig()
  const t = frame / fps
  const end = durationInFrames / fps
  const phone = meta.frame === 'phone'
  const vw = meta.viewport.width
  const vh = meta.viewport.height

  // Where the screen sits in the output, and how big a CSS pixel of the page is there.
  const captionH = phone ? 190 : 0
  const bezel = phone ? 16 : 0
  const bar = phone ? 0 : 36
  const room = phone ? { w: width - 120, h: height - captionH - 60 } : { w: width - 80, h: height - 150 }
  const k = Math.min((room.w - 2 * bezel) / vw, (room.h - 2 * bezel - bar) / vh)
  const sw = vw * k
  const sh = vh * k
  const fx = (width - sw) / 2 - bezel
  const fy = phone ? captionH : 30

  const cam = camera(meta.events, t, vw, vh, phone)
  const opacity = interpolate(t, [0, 0.3, end - 0.45, end], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: 'Geist Variable, sans-serif', opacity }}>
      <div
        style={{
          position: 'absolute',
          left: fx,
          top: fy,
          width: sw + 2 * bezel,
          height: sh + 2 * bezel + bar,
          borderRadius: phone ? 56 : 14,
          background: phone ? C.frame : '#fff',
          padding: bezel,
          boxShadow: phone
            ? '0 40px 80px -40px rgba(20,25,40,.55), 0 0 0 1px rgba(20,25,40,.15)'
            : '0 30px 70px -34px rgba(20,25,40,.45), 0 0 0 1px rgba(20,25,40,.12)',
        }}
      >
        {phone ? null : <WindowBar />}
        <div style={{ position: 'relative', width: sw, height: sh, overflow: 'hidden', borderRadius: phone ? 42 : '0 0 12px 12px' }}>
          <div
            style={{
              position: 'absolute',
              width: vw,
              height: vh,
              transformOrigin: '0 0',
              transform: `scale(${k}) scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)`,
            }}
          >
            <Img src={staticFile(`raw/${meta.id}/${meta.frames[Math.min(frame, meta.frames.length - 1)]}`)} style={{ width: vw, height: vh }} />
            <Spotlight events={meta.events} t={t} />
            <Pointer events={meta.events} t={t} phone={phone} />
          </div>
        </div>
      </div>
      <Caption events={meta.events} t={t} phone={phone} />
    </AbsoluteFill>
  )
}

/** The camera at `t`: a zoom `z` and the page point at the screen's top left, easing from one focus to
 *  the next. */
function camera(events: ClipEvent[], t: number, vw: number, vh: number, phone: boolean) {
  const whole = { z: 1, x: 0, y: 0 }
  const view = (rect: Rect | null) => {
    if (!rect) return whole
    // A phone's rows are its whole width: zooming would cut off their state marks, so the spotlight alone
    // points there. A desktop zooms in a little.
    if (phone) return whole
    const z = Math.min(1.35, Math.max(1, Math.min((vw * 0.8) / rect.width, (vh * 0.7) / rect.height)))
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    const x = Math.min(Math.max(cx - vw / z / 2, 0), vw - vw / z)
    const y = Math.min(Math.max(cy - vh / z / 2, 0), vh - vh / z)
    return { z, x, y }
  }
  const focuses = events.filter((e): e is Extract<ClipEvent, { kind: 'focus' }> => e.kind === 'focus' && e.t <= t)
  const last = focuses.at(-1)
  if (!last) return whole
  const from = view(focuses.at(-2)?.rect ?? null)
  const to = view(last.rect)
  const p = ease(Math.min(1, (t - last.t) / CAMERA))
  return { z: from.z + (to.z - from.z) * p, x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p }
}

/** Everything but the focus, dimmed, and a ring round it; it fades in, moves along, and fades out. */
function Spotlight({ events, t }: { events: ClipEvent[]; t: number }) {
  const focuses = events.filter((e): e is Extract<ClipEvent, { kind: 'focus' }> => e.kind === 'focus' && e.t <= t)
  const last = focuses.at(-1)
  if (!last) return null
  const prev = focuses.at(-2)?.rect ?? null
  const since = t - last.t
  const rect = last.rect ?? prev
  if (!rect) return null
  const shown = last.rect ? (prev ? 1 : Math.min(1, since / 0.35)) : Math.max(0, 1 - since / 0.35)
  const p = prev && last.rect ? ease(Math.min(1, since / 0.45)) : 1
  const from = prev && last.rect ? prev : rect
  const r = {
    x: from.x + (rect.x - from.x) * p,
    y: from.y + (rect.y - from.y) * p,
    width: from.width + (rect.width - from.width) * p,
    height: from.height + (rect.height - from.height) * p,
  }
  if (shown <= 0) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: r.x + 4,
        top: r.y + 2,
        width: r.width - 8,
        height: r.height - 4,
        borderRadius: 12,
        opacity: shown,
        boxShadow: `0 0 0 2px ${C.accent}, 0 0 0 9999px rgba(30,34,46,.32)`,
      }}
    />
  )
}

/** A finger (a soft dot) on a phone, an arrow on a desktop: it travels to each click, and a ring spreads
 *  where it lands. */
function Pointer({ events, t, phone }: { events: ClipEvent[]; t: number; phone: boolean }) {
  const points = events.filter((e): e is Extract<ClipEvent, { kind: 'click' | 'type' }> => e.kind === 'click' || e.kind === 'type')
  const next = points.find((p) => p.t >= t)
  const prev = [...points].reverse().find((p) => p.t < t)
  if (!next && !prev) return null
  let x: number
  let y: number
  let shown = 1
  if (next && t >= next.t - MOVE) {
    const p = ease((t - (next.t - MOVE)) / MOVE)
    const from = prev ?? { x: next.x + 60, y: next.y + 120 }
    x = from.x + (next.x - from.x) * p
    y = from.y + (next.y - from.y) * p
    if (!prev) shown = Math.min(1, (t - (next.t - MOVE)) / 0.25)
  } else {
    const at = prev ?? next!
    x = at.x
    y = at.y
    // A phone's finger lifts after the tap.
    if (phone && prev) shown = interpolate(t - prev.t, [0.5, 0.9], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    if (phone && !prev) shown = 0
  }
  const tap = prev && prev.kind === 'click' ? t - prev.t : Infinity
  const ring = tap < 0.6 ? tap / 0.6 : null
  return (
    <>
      {ring !== null ? (
        <div
          style={{
            position: 'absolute',
            left: (prev as { x: number }).x - 28,
            top: (prev as { y: number }).y - 28,
            width: 56,
            height: 56,
            borderRadius: 999,
            border: `3px solid ${C.accent}`,
            opacity: 1 - ring,
            transform: `scale(${0.4 + ring})`,
          }}
        />
      ) : null}
      {phone ? (
        <div
          style={{
            position: 'absolute',
            left: x - 18,
            top: y - 18,
            width: 36,
            height: 36,
            borderRadius: 999,
            background: 'rgba(22,25,31,.28)',
            border: '2px solid rgba(255,255,255,.9)',
            opacity: shown,
            transform: `scale(${tap < 0.15 ? 0.85 : 1})`,
          }}
        />
      ) : (
        <svg style={{ position: 'absolute', left: x - 3, top: y - 2, opacity: shown }} width="22" height="28" viewBox="0 0 22 28">
          <path d="M2 2 L2 22 L7.5 17 L11 25.5 L14.5 24 L11 15.8 L18.5 15.8 Z" fill={C.fg} stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      )}
    </>
  )
}

function WindowBar() {
  return (
    <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderBottom: `1px solid ${C.border}` }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 11, height: 11, borderRadius: 99, background: C.border }} />
      ))}
    </div>
  )
}

/** The step's one line: above the phone, or in a pill over the window's foot. */
function Caption({ events, t, phone }: { events: ClipEvent[]; t: number; phone: boolean }) {
  const captions = events.filter((e): e is Extract<ClipEvent, { kind: 'caption' }> => e.kind === 'caption')
  const now = [...captions].reverse().find((c) => c.t <= t + 0.05)
  if (!now) return null
  const fade = interpolate(t - now.t, [0, 0.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const lift = (1 - fade) * 10
  const text = (
    <span style={{ opacity: fade, transform: `translateY(${lift}px)`, display: 'inline-block' }}>{now.text}</span>
  )
  return phone ? (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 40,
        right: 40,
        height: 190,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontSize: 40,
        lineHeight: 1.2,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        color: C.fg,
      }}
    >
      {text}
    </div>
  ) : (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 26, display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          padding: '12px 26px',
          borderRadius: 999,
          background: C.fg,
          color: '#fff',
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          boxShadow: '0 12px 30px -12px rgba(20,25,40,.5)',
        }}
      >
        {text}
      </div>
    </div>
  )
}
