/** One recorded screen in its frame: a phone, or a browser window. Inside it the camera moves to where
 *  things happen, a spotlight rings it, and a finger or an arrow goes where the script tapped, swiped,
 *  pressed or clicked. */
import { Img, interpolate, staticFile } from 'remotion'
import type { ClipEvent, Layer, Rect, ViewMeta } from '../clip.ts'
import { Browser } from './Browser'
import { C, CAMERA, MOVE, ease, only } from './theme'

const BEZEL = 14
const BAR = 46

/** Where a screen's frame and its page sit in the picture, and how big a CSS pixel of the page is there. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
  /** The page's own area, inside the frame. */
  inner: { x: number; y: number; width: number; height: number }
  k: number
}

export function screenBox(view: ViewMeta, at: Extract<Layer, { view: string }>): Box {
  const phone = view.kind === 'phone'
  const top = phone ? BEZEL : BAR
  const side = phone ? BEZEL : 0
  const k = (at.height - top - (phone ? BEZEL : 0)) / view.viewport.height
  const w = view.viewport.width * k
  return {
    x: at.x,
    y: at.y,
    width: w + 2 * side,
    height: at.height,
    inner: { x: at.x + side, y: at.y + top, width: w, height: view.viewport.height * k },
    k,
  }
}

export function Screen(props: { id: string; view: ViewMeta; box: Box; url?: string; events: ClipEvent[]; frame: number; t: number }) {
  const { id, view, box, url, events, frame, t } = props
  const phone = view.kind === 'phone'
  const { width: vw, height: vh } = view.viewport
  const cam = camera(events, t, vw, vh, phone)
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        borderRadius: phone ? 58 : 16,
        background: phone ? C.frame : '#fff',
        padding: phone ? BEZEL : 0,
        boxShadow: phone
          ? '0 40px 80px -40px rgba(20,25,40,.6), 0 0 0 1px rgba(20,25,40,.15)'
          : '0 34px 80px -36px rgba(20,25,40,.5), 0 0 0 1px rgba(20,25,40,.12)',
        overflow: phone ? undefined : 'hidden',
      }}
    >
      {phone ? null : <WindowBar url={url} />}
      <div
        style={{ position: 'relative', width: box.inner.width, height: box.inner.height, overflow: 'hidden', borderRadius: phone ? 44 : 0 }}
      >
        <div
          style={{
            position: 'absolute',
            width: vw,
            height: vh,
            transformOrigin: '0 0',
            transform: `scale(${box.k}) scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)`,
          }}
        >
          <Img src={staticFile(`raw/${id}/${view.frames[Math.min(frame, view.frames.length - 1)]}`)} style={{ width: vw, height: vh }} />
          <Spotlight events={events} t={t} vw={vw} />
          <Browser events={events} t={t} />
          <Pointer events={events} t={t} phone={phone} />
        </div>
      </div>
    </div>
  )
}

/** The camera at `t`: a zoom `z` and the page point at the screen's top left, easing from one focus to
 *  the next. A phone's rows are its whole width, so it does not zoom: the spotlight alone points. */
function camera(events: ClipEvent[], t: number, vw: number, vh: number, phone: boolean) {
  const whole = { z: 1, x: 0, y: 0 }
  const view = (rect: Rect | null) => {
    if (!rect || phone) return whole
    const z = Math.min(1.6, Math.max(1, Math.min((vw * 0.8) / rect.width, (vh * 0.7) / rect.height)))
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    const x = Math.min(Math.max(cx - vw / z / 2, 0), vw - vw / z)
    const y = Math.min(Math.max(cy - vh / z / 2, 0), vh - vh / z)
    return { z, x, y }
  }
  const focuses = only(events, 'focus').filter((e) => e.t <= t)
  const last = focuses.at(-1)
  if (!last) return whole
  const from = view(focuses.at(-2)?.rect ?? null)
  const to = view(last.rect)
  const p = ease(Math.min(1, (t - last.t) / CAMERA))
  return { z: from.z + (to.z - from.z) * p, x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p }
}

/** Everything but the focus, dimmed, and a ring round it; it fades in, moves along, and fades out. */
function Spotlight({ events, t, vw }: { events: ClipEvent[]; t: number; vw: number }) {
  const focuses = only(events, 'focus').filter((e) => e.t <= t)
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
  // A full-width row is ringed just inside its edges; anything narrower gets a little room round it.
  const pad = r.width >= vw - 24 ? -4 : 8
  return (
    <div
      style={{
        position: 'absolute',
        left: Math.max(2, r.x - pad),
        top: r.y - pad / 2,
        width: Math.min(vw - 4, r.width + 2 * pad),
        height: r.height + pad,
        borderRadius: 12,
        opacity: shown,
        boxShadow: `0 0 0 2px ${C.accent}, 0 0 0 9999px rgba(30,34,46,.32)`,
      }}
    />
  )
}

/** What the finger or the cursor does: from `t` to `until`, it goes from (x, y) to (x2, y2). */
interface Move {
  t: number
  until: number
  x: number
  y: number
  x2: number
  y2: number
  tap: boolean
  hold: boolean
}

const movesOf = (events: ClipEvent[]): Move[] =>
  events.flatMap((e): Move[] => {
    const still = { x2: 0, y2: 0, tap: false, hold: false }
    if (e.kind === 'click') return [{ ...still, t: e.t, until: e.t, x: e.x, y: e.y, x2: e.x, y2: e.y, tap: true }]
    if (e.kind === 'type') return [{ ...still, t: e.t, until: e.t, x: e.x, y: e.y, x2: e.x, y2: e.y }]
    if (e.kind === 'press') return [{ ...still, t: e.t, until: e.t + e.ms / 1000, x: e.x, y: e.y, x2: e.x, y2: e.y, hold: true }]
    if (e.kind === 'swipe') return [{ ...still, t: e.t, until: e.t + e.ms / 1000, x: e.x, y: e.y, x2: e.x + e.dx, y2: e.y + (e.dy ?? 0) }]
    return []
  })

/** A finger (a soft dot) on a phone, an arrow on a desktop: it travels to each move, follows a swipe,
 *  and a ring spreads where it taps or grows where it holds. */
function Pointer({ events, t, phone }: { events: ClipEvent[]; t: number; phone: boolean }) {
  const moves = movesOf(events)
  const now = moves.find((m) => m.t <= t && t <= m.until)
  const next = moves.find((m) => m.t > t)
  const prev = [...moves].reverse().find((m) => m.until < t)
  if (!now && !next && !prev) return null
  let x: number
  let y: number
  let seen = 1
  if (now) {
    const p = now.until > now.t ? (t - now.t) / (now.until - now.t) : 1
    const q = 1 - (1 - p) ** 2
    x = now.x + (now.x2 - now.x) * q
    y = now.y + (now.y2 - now.y) * q
  } else if (next && t >= next.t - MOVE) {
    const p = ease((t - (next.t - MOVE)) / MOVE)
    // A finger comes down from where it last lifted, or from below.
    const from = prev && !(phone && t - prev.until > 0.9) ? { x: prev.x2, y: prev.y2 } : { x: next.x + 60, y: next.y + 140 }
    x = from.x + (next.x - from.x) * p
    y = from.y + (next.y - from.y) * p
    if (!prev || (phone && t - prev.until > 0.9)) seen = Math.min(1, (t - (next.t - MOVE)) / 0.25)
  } else {
    const at = prev ?? next!
    x = prev ? at.x2 : at.x
    y = prev ? at.y2 : at.y
    // A phone's finger lifts after it is done; a mouse left alone fades (the keyboard has it now).
    const idle = phone ? [0.4, 0.8] : [1.2, 1.7]
    if (prev) seen = interpolate(t - prev.until, idle, [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    else if (phone) seen = 0
  }
  const tapped = prev?.tap ? t - prev.until : Infinity
  const ring = tapped < 0.6 ? tapped / 0.6 : null
  const held = now?.hold ? (t - now.t) / (now.until - now.t) : null
  return (
    <>
      {ring !== null ? (
        <div
          style={{
            position: 'absolute',
            left: prev!.x2 - 28,
            top: prev!.y2 - 28,
            width: 56,
            height: 56,
            borderRadius: 999,
            border: `3px solid ${C.accent}`,
            opacity: 1 - ring,
            transform: `scale(${0.4 + ring})`,
          }}
        />
      ) : null}
      {held !== null ? (
        <div
          style={{
            position: 'absolute',
            left: x - 34,
            top: y - 34,
            width: 68,
            height: 68,
            borderRadius: 999,
            background: 'rgba(26,111,214,.18)',
            border: `3px solid ${C.accent}`,
            transform: `scale(${0.5 + 0.5 * held})`,
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
            opacity: seen,
            transform: `scale(${now || tapped < 0.15 ? 0.85 : 1})`,
          }}
        />
      ) : (
        <svg style={{ position: 'absolute', left: x - 3, top: y - 2, opacity: seen }} width="22" height="28" viewBox="0 0 22 28">
          <path
            d="M2 2 L2 22 L7.5 17 L11 25.5 L14.5 24 L11 15.8 L18.5 15.8 Z"
            fill={C.fg}
            stroke="#fff"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </>
  )
}

/** A browser's top: three dots and the address. */
function WindowBar({ url }: { url?: string }) {
  return (
    <div
      style={{
        height: BAR,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 16px',
        borderBottom: `1px solid ${C.border}`,
        background: '#eef0f3',
      }}
    >
      {['#ec6a5e', '#f4bf4f', '#61c554'].map((c) => (
        <span key={c} style={{ width: 13, height: 13, borderRadius: 99, background: c }} />
      ))}
      {url ? (
        <span
          style={{
            marginLeft: 18,
            flex: '0 1 520px',
            padding: '5px 14px',
            borderRadius: 8,
            background: '#fff',
            color: C.muted,
            fontSize: 18,
          }}
        >
          {url}
        </span>
      ) : null}
    </div>
  )
}
