import { cn } from '@/lib/utils'
import { CopyButton } from './terminal'

/** One command on a line of its own, to copy: the install command, under the page's title. */
export function CommandPill({ command, large, className }: { command: string; large?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-border bg-card py-1 pr-1 pl-3 font-mono text-sm',
        large && 'h-12 text-base',
        className,
      )}
    >
      <span className="text-muted-foreground select-none">$</span>
      {command}
      <CopyButton text={command} />
    </div>
  )
}
