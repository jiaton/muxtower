import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
}

/** A row of mutually exclusive choices (e.g. a list's view or a pane's mode). */
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
  return (
    <div role="radiogroup" className={cn('flex gap-0.5 rounded-md bg-surface-muted p-0.5', className)} {...aria}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex h-8 min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden rounded-sm px-2 text-sm whitespace-nowrap text-fg-muted transition-colors select-none focus-visible:outline-2 focus-visible:outline-focus',
            option.value === value ? 'bg-surface font-medium text-fg shadow-card' : 'hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
