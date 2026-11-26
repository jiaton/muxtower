import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** How full something is, by how near its limit: quiet until it is high, then the warning tone, then danger. */
export type MeterTone = 'normal' | 'warning' | 'danger'

const fill: Record<MeterTone, string> = { normal: 'bg-fg-muted', warning: 'bg-state-permission', danger: 'bg-danger' }
const ink: Record<MeterTone, string> = { normal: 'text-fg-muted', warning: 'text-state-permission', danger: 'text-danger' }

const clamp = (value: number) => Math.min(100, Math.max(0, value))

/** How much of something is used, as a bar: `value` 0–100, or null when it is not known (an empty track,
 *  nothing guessed). Not a progress bar: nothing is on its way, it is a reading. */
export function Meter({ value, tone = 'normal', label, className }: { value: number | null; tone?: MeterTone; label: string; className?: string }) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-border', className)}
    >
      {value === null ? null : <div className={cn('h-full rounded-full', fill[tone])} style={{ width: `${clamp(value)}%` }} />}
    </div>
  )
}

/** The same as a ring around what it holds (a figure, an icon): in a pill, where a bar has no room. Its
 *  track takes the colour of the text around it, faintly. */
export function Ring({ value, tone = 'normal', label, children }: { value: number | null; tone?: MeterTone; label: string; children?: ReactNode }) {
  const r = 15.5
  const length = 2 * Math.PI * r
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      className="relative inline-grid size-10 shrink-0 place-items-center text-xs font-medium tabular-nums"
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-current opacity-20" />
        {value === null ? null : (
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - clamp(value) / 100)}
            className={cn('stroke-current', ink[tone])}
          />
        )}
      </svg>
      <span className={cn('relative flex [&_svg]:size-4', tone !== 'normal' && ink[tone])}>{children}</span>
    </span>
  )
}
