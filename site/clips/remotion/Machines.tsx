import type { ClipEvent } from '../clip.ts'
import type { Box } from './Screen'
import { C, only } from './theme'

/** One color per machine, in the order the script names them. */
const TONES = [C.accent, '#0f8a5a', '#a35a00']

/** Which machine each part of a screen is on: a bracket beside the window along that machine's rows, and
 *  its name (and what it is, e.g. "hub") at the bracket's middle. Drawn in the picture, outside the window. */
export function Machines({ events, t, boxes, first }: { events: ClipEvent[]; t: number; boxes: Record<string, Box>; first?: string }) {
  const machines = only(events, 'machine')
  return (
    <>
      {machines.map((m, i) => {
        const box = boxes[m.view ?? first ?? '']
        if (!box || m.t > t) return null
        const seen = Math.min(1, (t - m.t) / 0.4)
        const top = box.inner.y + m.rect.y * box.k + 4
        const bottom = box.inner.y + (m.rect.y + m.rect.height) * box.k - 4
        const x = box.x - 30
        const tone = TONES[i % TONES.length]!
        return (
          <div key={i} style={{ opacity: seen }}>
            <div
              style={{
                position: 'absolute',
                left: x,
                top,
                width: 16,
                height: bottom - top,
                border: `5px solid ${tone}`,
                borderRight: 'none',
                borderRadius: '10px 0 0 10px',
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: 1920 - x + 18,
                top: (top + bottom) / 2 - 44,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 2,
                color: tone,
                transform: `translateX(${(1 - seen) * -14}px)`,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em' }}>
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={tone}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="4" width="20" height="13" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
                {m.label}
              </span>
              {m.note ? <span style={{ fontSize: 28, fontWeight: 550, color: C.muted }}>{m.note}</span> : null}
            </div>
          </div>
        )
      })}
    </>
  )
}
