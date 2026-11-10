import type { ClipEvent } from '../clip.ts'
import { C, ease, only, shown } from './theme'

const DRAW = 0.55 // seconds the arrow takes to reach its end

/** Work handed from one row to another: a curve out past the rows' right ends and back, drawn from the
 *  sender to the receiver, an arrowhead at the receiver, and the hand-off's label on the bend. Drawn in
 *  page pixels, under the camera. */
export function Arrows({ events, t }: { events: ClipEvent[]; t: number }) {
  return (
    <>
      {only(events, 'arrow')
        .filter((a) => a.t <= t && t <= a.t + a.ms / 1000 + 0.3)
        .map((a) => (
          <Arrow key={a.t} arrow={a} t={t} />
        ))}
    </>
  )
}

function Arrow({ arrow, t }: { arrow: Extract<ClipEvent, { kind: 'arrow' }>; t: number }) {
  const { from, to, label } = arrow
  const since = t - arrow.t
  const seen = shown(t, arrow.t, arrow.t + arrow.ms / 1000, 0.25)
  const p = ease(Math.min(1, since / DRAW))
  const right = Math.max(from.x + from.width, to.x + to.width) - 18
  const y1 = from.y + from.height / 2
  const y2 = to.y + to.height / 2
  const bend = right + 40 + Math.min(90, Math.abs(y2 - y1) * 0.25)
  const d = `M ${right} ${y1} C ${bend} ${y1}, ${bend} ${y2}, ${right + 8} ${y2}`
  const length = 2 * Math.abs(y2 - y1) + 2 * (bend - right) // enough for the dash to cover it
  const mid = (y1 + y2) / 2
  const pad = 40
  const top = Math.min(y1, y2) - pad
  const left = right - pad
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, opacity: seen }}>
      <svg
        style={{ position: 'absolute', left, top, overflow: 'visible' }}
        width={bend - right + 2 * pad}
        height={Math.abs(y2 - y1) + 2 * pad}
        viewBox={`${left} ${top} ${bend - right + 2 * pad} ${Math.abs(y2 - y1) + 2 * pad}`}
      >
        <circle cx={right} cy={y1} r={5} fill={C.accent} />
        <path
          d={d}
          fill="none"
          stroke={C.accent}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - p)}
        />
        {p >= 1 ? (
          <path
            d={`M ${right + 18} ${y2 - 8} L ${right + 6} ${y2} L ${right + 18} ${y2 + 8}`}
            fill="none"
            stroke={C.accent}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: bend + 2,
          top: mid - 15,
          padding: '4px 11px',
          borderRadius: 999,
          background: C.accent,
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          boxShadow: '0 10px 24px -10px rgba(20,25,40,.5)',
          opacity: Math.min(1, since / 0.3),
          transform: `translateX(${(1 - Math.min(1, since / 0.3)) * -8}px)`,
        }}
      >
        {label}
      </div>
    </div>
  )
}
