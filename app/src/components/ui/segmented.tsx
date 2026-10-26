import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
}

const ITEM = 'flex h-8 items-center justify-center gap-1 rounded-sm px-2 whitespace-nowrap'

/** A row of mutually exclusive choices (e.g. a list's view or a pane's mode). A label never leaves its
 *  segment: when the labels do not fit the row at the normal size (measured on an invisible copy, so it
 *  holds for any font and text size), the row takes a smaller one, and if even that is too wide, the
 *  segments keep their labels' width and the row scrolls sideways. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  ...aria
}: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  className?: string
  'aria-label': string
}) {
  const root = useRef<HTMLDivElement>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const [small, setSmall] = useState(false)

  useLayoutEffect(() => {
    const row = root.current
    const full = ghost.current
    if (!row || !full) return
    const check = () => setSmall(full.offsetWidth > row.clientWidth)
    check()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(check)
    observer.observe(row)
    observer.observe(full)
    return () => observer.disconnect()
  }, [])

  return (
    <div role="radiogroup" ref={root} className={cn('relative flex gap-0.5 overflow-x-auto rounded-md bg-surface-muted p-0.5 [scrollbar-width:none]', className)} {...aria}>
      <div ref={ghost} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex w-max gap-0.5 p-0.5">
        {options.map((option) => (
          <span key={option.value} className={cn(ITEM, 'text-sm font-medium')}>
            {option.label}
          </span>
        ))}
      </div>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            ITEM,
            'min-w-fit flex-1 text-fg-muted transition-colors select-none focus-visible:outline-2 focus-visible:outline-focus',
            small ? 'text-xs' : 'text-sm',
            option.value === value ? 'bg-surface font-medium text-fg shadow-card' : 'hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
