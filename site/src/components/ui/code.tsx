import { cn } from '@/lib/cn'
import { CopyButton } from './copy-button'

/** A shell command on one line, with a prompt and a copy button. */
export function Command({ command, className }: { command: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface py-1 pr-1 pl-4 text-left font-mono text-sm',
        className,
      )}
    >
      <span aria-hidden className="text-fg-muted select-none">
        $
      </span>
      <code className="min-w-0 flex-1 overflow-x-auto py-1.5 whitespace-nowrap">{command}</code>
      <CopyButton text={command} label={`Copy: ${command}`} />
    </div>
  )
}

/** A snippet of several lines (a config file), on the terminal's colors, with a copy button. */
export function Snippet({ code, caption }: { code: string; caption?: string }) {
  return (
    <figure className="overflow-hidden rounded-md border border-border bg-terminal-bg text-terminal-fg">
      {caption && (
        <figcaption className="flex items-center justify-between border-b border-term-0 py-1 pr-1 pl-4 font-mono text-xs text-term-8">
          {caption}
          <CopyButton text={code} label={`Copy ${caption}`} className="text-term-8 hover:bg-term-0 hover:text-terminal-fg" />
        </figcaption>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
    </figure>
  )
}
