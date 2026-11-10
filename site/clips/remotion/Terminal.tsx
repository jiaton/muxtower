/** A terminal window, drawn (no real terminal): an agent in tmux, its lines appearing as the clip's
 *  `term` events say. A line the owner sent is typed out; the rest appear whole. */
import type { ClipEvent, Layer } from '../clip.ts'
import { only } from './theme'

const TONE = { prompt: '#f2f4f7', out: '#c9ced6', dim: '#7d8592', ok: '#5fd38d', work: '#f0a35e' } as const
const LINE = 34

export function Terminal({ layer, events, t }: { layer: Extract<Layer, { terminal: string }>; events: ClipEvent[]; t: number }) {
  const lines = only(events, 'term').filter((e) => e.t <= t)
  const rows = Math.floor((layer.height - 46 - 44 - 28) / LINE)
  return (
    <div
      style={{
        position: 'absolute',
        left: layer.x,
        top: layer.y,
        width: layer.width,
        height: layer.height,
        borderRadius: 16,
        overflow: 'hidden',
        background: '#16181d',
        boxShadow: '0 34px 80px -36px rgba(20,25,40,.6), 0 0 0 1px rgba(20,25,40,.4)',
        fontFamily: 'ui-monospace, "SF Mono", Menlo, "DejaVu Sans Mono", monospace',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 46,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 16px',
          background: '#24272e',
          color: '#9aa1ad',
          fontSize: 18,
        }}
      >
        {['#ec6a5e', '#f4bf4f', '#61c554'].map((c) => (
          <span key={c} style={{ width: 13, height: 13, borderRadius: 99, background: c }} />
        ))}
        <span style={{ flex: 1, textAlign: 'center', marginRight: 60 }}>{layer.terminal}</span>
      </div>
      <div style={{ flex: 1, padding: '14px 22px', fontSize: 24, lineHeight: `${LINE}px`, overflow: 'hidden' }}>
        {lines.slice(-rows).map((l, i) => {
          const tone = l.tone ?? 'out'
          const typed = tone === 'prompt' ? Math.min(l.text.length, Math.floor((t - l.t) / 0.018)) : l.text.length
          return (
            <div
              key={i}
              style={{
                color: TONE[tone],
                fontWeight: tone === 'prompt' ? 650 : 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {tone === 'prompt' ? <span style={{ color: TONE.dim }}>{'> '}</span> : null}
              {l.text.slice(0, typed)}
            </div>
          )
        })}
      </div>
      {/* tmux's status line */}
      <div
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '0 14px',
          background: '#2f8f4e',
          color: '#0d1f14',
          fontSize: 20,
          fontWeight: 600,
        }}
      >
        <span>[shop] 0:claude*</span>
        <span style={{ marginLeft: 'auto' }}>build-box</span>
      </div>
    </div>
  )
}
