import { Gauge } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/cn'

/** A small mark beside a name when something about it is over a limit: nothing otherwise. It opens to the
 *  lines that say what (`lines`), then quieter ones (`details`). */
export function WarningMark({
  what,
  lines,
  details = [],
  className,
}: {
  what: string
  lines: string[]
  details?: string[]
  className?: string
}) {
  if (!lines.length) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${what}: ${lines[0]}`}
          title={`${what}: ${lines[0]}`}
          className={cn('flex size-6 items-center justify-center rounded text-state-permission hover:bg-surface', className)}
        >
          <Gauge className="size-3.5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-80">
        <DropdownMenuLabel>{what}</DropdownMenuLabel>
        {[...lines, ...details].map((line, i) => (
          <p key={i} className={cn('px-2 py-1 text-sm', i >= lines.length && 'text-xs text-fg-muted')}>
            {line}
          </p>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
