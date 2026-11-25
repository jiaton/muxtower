import { lazy, Suspense } from 'react'
import { cn } from '@/lib/cn'
import { Skeleton } from './skeleton'
import { focusRing } from './styles'

// Loaded when first shown (about 20 KB gzipped with the date-fns parts it uses): most visits never pick a date.
const DayPicker = lazy(() => import('react-day-picker').then((m) => ({ default: m.DayPicker })))

const NAV = `inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg ${focusRing} disabled:opacity-40`

/**
 * A month to pick one day from: react-day-picker (maintained, accessible: a grid with arrow keys, Page Up and
 * Down for months, labelled days), drawn here in our tokens instead of its stylesheet, and loaded when first
 * shown. Days before `from` (if given) cannot be picked.
 */
export function DatePicker({
  selected,
  onSelect,
  from,
  className,
}: {
  selected: Date | undefined
  onSelect: (day: Date | undefined) => void
  from?: Date
  className?: string
}) {
  return (
    <Suspense fallback={<Skeleton shape="block" className="block h-72 w-64" />}>
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={onSelect}
        defaultMonth={selected ?? from}
        disabled={from ? { before: from } : undefined}
        showOutsideDays
        className={cn('relative w-fit', className)}
        classNames={{
          months: 'flex flex-col',
          month: 'flex flex-col gap-2',
          month_caption: 'flex h-8 items-center px-2 text-sm font-medium text-fg',
          nav: 'absolute top-0 right-0 flex gap-1',
          button_previous: NAV,
          button_next: NAV,
          chevron: 'size-4 fill-current',
          month_grid: 'border-collapse',
          weekdays: '',
          weekday: 'size-9 text-xs font-normal text-fg-muted',
          week: '',
          day: 'p-0 text-center text-sm text-fg',
          day_button: `size-9 rounded-md tabular-nums hover:bg-surface-muted ${focusRing} disabled:pointer-events-none`,
          selected: '[&>button]:bg-accent [&>button]:text-accent-fg [&>button]:hover:bg-accent-hover',
          today: 'font-semibold text-accent',
          outside: 'text-fg-muted opacity-60',
          disabled: 'opacity-40',
        }}
      />
    </Suspense>
  )
}
