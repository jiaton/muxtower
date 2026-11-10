import { interpolate } from 'remotion'
import type { ClipEvent } from '../clip.ts'
import { C } from './theme'

/** A browser an agent drives, staged: a small checkout page whose Pay goes through on the retry. Drawn in
 *  page pixels over the part of the screen the script named. */
export function Browser({ events, t }: { events: ClipEvent[]; t: number }) {
  const b = [...events].reverse().find((e): e is Extract<ClipEvent, { kind: 'browser' }> => e.kind === 'browser' && e.t <= t)
  if (!b) return null
  const since = t - b.t
  const end = b.ms / 1000
  if (since > end + 0.35) return null
  const shown = interpolate(since, [0, 0.35, end, end + 0.35], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const p = since / end
  const pressed = p > 0.35
  const paid = p > 0.62
  const { x, y, width, height } = b.rect
  const w = Math.min(width - 48, 460)
  return (
    <div
      style={{
        position: 'absolute',
        left: x + (width - w) / 2,
        top: y + Math.max(24, (height - 330) / 2),
        width: w,
        borderRadius: 12,
        overflow: 'hidden',
        background: '#fff',
        border: `1px solid ${C.border}`,
        boxShadow: '0 30px 60px -24px rgba(20,25,40,.45)',
        opacity: shown,
        transform: `scale(${0.96 + 0.04 * shown})`,
        fontSize: 14,
        color: C.fg,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: '#eef0f3',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 9, height: 9, borderRadius: 9, background: '#cfd3da' }} />
        ))}
        <span style={{ flex: 1, marginLeft: 8, padding: '3px 10px', borderRadius: 6, background: '#fff', color: C.muted, fontSize: 12 }}>
          {b.url}
        </span>
      </div>
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Checkout</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: C.muted }}>
          <span>Order 1042 · 2 items</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>$48.00</span>
        </div>
        <div
          style={{
            marginTop: 4,
            padding: '10px 0',
            borderRadius: 8,
            textAlign: 'center',
            fontWeight: 600,
            color: '#fff',
            background: paid ? '#1f8f5a' : C.accent,
            transform: `scale(${pressed && !paid && p < 0.42 ? 0.97 : 1})`,
          }}
        >
          {paid ? 'Paid ✓' : pressed ? 'Paying…' : 'Pay $48.00'}
        </div>
        <div style={{ minHeight: 18, fontSize: 13, color: paid ? '#1f8f5a' : C.muted }}>
          {paid ? 'Went through on the retry, same idempotency key' : pressed ? 'Card network timed out · retrying once' : ''}
        </div>
      </div>
      <div style={{ padding: '7px 12px', borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.muted, display: 'flex', gap: 6 }}>
        <span style={{ width: 8, height: 8, marginTop: 4, borderRadius: 8, background: C.accent }} />
        {b.label}
      </div>
    </div>
  )
}
