import { PanelLeft } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './button'
import { focusRing } from './styles'

/** A layout drawn as itself, in an icon's box: a window with `panes` columns, the first ones narrow (a
 *  sidebar, a list) and the last the widest (what they are beside). */
export function LayoutGlyph({ panes, label, className }: { panes: 1 | 2 | 3; label?: string; className?: string }) {
  const lines = panes === 3 ? [7, 12] : panes === 2 ? [10] : []
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-4 shrink-0', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {label ? <title>{label}</title> : null}
      <rect x="3" y="4" width="18" height="16" rx="2" />
      {lines.map((x) => (
        <path key={x} d={`M${x} 4v16`} />
      ))}
    </svg>
  )
}

export interface LayoutOption<T extends string> {
  value: T
  label: string
  panes: 1 | 2 | 3
}

/** Which panes stand side by side: a segment per layout, each drawn as the layout it gives, the current
 *  one filled. Picking the current one again does nothing. */
export function LayoutSwitch<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: LayoutOption<T>[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label="Layout" className={cn('flex shrink-0 gap-0.5 rounded-md border border-border bg-surface p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => o.value !== value && onChange(o.value)}
          className={cn(
            `flex h-6 w-7 items-center justify-center rounded-sm transition-colors select-none ${focusRing}`,
            o.value === value ? 'bg-fg text-bg' : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
          )}
        >
          <LayoutGlyph panes={o.panes} label={o.label} className="size-3.5" />
        </button>
      ))}
    </div>
  )
}

/** Shows the panes the layout hides (the one drawer): a panel-left at the top-left of the leftmost pane
 *  showing. Carries how many need the owner (`count`), or a dot when something else wants a look. */
export function ShowPanesButton({
  label,
  count = 0,
  alert = false,
  expanded,
  onClick,
}: {
  label: string
  count?: number
  alert?: boolean
  expanded?: boolean
  onClick: () => void
}) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} aria-expanded={expanded} onClick={onClick} className="relative">
      <PanelLeft />
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-state-permission px-1 text-center text-xs leading-4 font-semibold text-bg tabular-nums"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : alert ? (
        <span aria-hidden className="absolute top-0.5 right-0.5 size-2 rounded-full bg-state-permission" />
      ) : null}
    </Button>
  )
}
