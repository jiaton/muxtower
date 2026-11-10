/** What lies over the screens: the step's caption, words said aloud, and keys as they are pressed. */
import type { ClipEvent } from '../clip.ts'
import type { Box } from './Screen'
import { C, CAPTION_BAND, SIZE, only, shown } from './theme'

/** The step's one line, across the top. */
export function Caption({ events, t }: { events: ClipEvent[]; t: number }) {
  const now = [...only(events, 'caption')].reverse().find((c) => c.t <= t + 0.05)
  if (!now) return null
  const fade = Math.min(1, Math.max(0, (t - now.t) / 0.3))
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 60,
        right: 60,
        height: CAPTION_BAND,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontSize: 62,
        fontWeight: 650,
        letterSpacing: '-0.025em',
        color: C.fg,
      }}
    >
      <span style={{ opacity: fade, transform: `translateY(${(1 - fade) * 12}px)`, display: 'inline-block' }}>{now.text}</span>
    </div>
  )
}

/** Words said aloud, in a bubble over the screen of who said them: the clip is muted. */
export function Said({ events, t, boxes, first }: { events: ClipEvent[]; t: number; boxes: Record<string, Box>; first?: string }) {
  const said = [...only(events, 'say')].reverse().find((e) => e.t <= t)
  if (!said) return null
  const box = boxes[said.view ?? first ?? '']
  if (!box) return null
  const end = said.t + said.ms / 1000
  const seen = shown(t, said.t, end, 0.25)
  if (seen <= 0) return null
  const centre = Math.min(Math.max(box.x + box.width / 2, 380), SIZE.width - 380)
  return (
    <div
      style={{
        position: 'absolute',
        left: centre - 380,
        width: 760,
        top: box.y + box.height * 0.5,
        display: 'flex',
        justifyContent: 'center',
        opacity: seen,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '20px 32px',
          borderRadius: 32,
          background: C.fg,
          color: '#fff',
          fontSize: 44,
          fontWeight: 550,
          lineHeight: 1.2,
          boxShadow: '0 24px 60px -20px rgba(20,25,40,.65)',
          transform: `translateY(${(1 - seen) * 14}px)`,
        }}
      >
        <svg
          width="42"
          height="42"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flex: 'none' }}
        >
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
        </svg>
        <span>“{said.text}”</span>
      </div>
    </div>
  )
}

/** Keys as they are pressed: a key cap pops up at the foot and fades. */
export function Keys({ events, t }: { events: ClipEvent[]; t: number }) {
  const keys = only(events, 'key').filter((k) => k.t <= t && t < k.t + 1.1)
  if (!keys.length) return null
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 56, display: 'flex', justifyContent: 'center', gap: 18 }}>
      {keys.map((k) => {
        const since = t - k.t
        const pop = since < 0.12 ? 0.86 + since : since < 0.2 ? 1.06 - (since - 0.12) * 0.75 : 1
        return (
          <div
            key={k.t}
            style={{
              padding: '16px 30px',
              borderRadius: 18,
              background: '#fff',
              color: C.fg,
              border: `2px solid ${C.border}`,
              borderBottomWidth: 6,
              fontSize: 46,
              fontWeight: 650,
              boxShadow: '0 20px 44px -18px rgba(20,25,40,.5)',
              opacity: shown(t, k.t, k.t + 0.8, 0.15),
              transform: `scale(${pop})`,
            }}
          >
            {k.label}
          </div>
        )
      })}
    </div>
  )
}
