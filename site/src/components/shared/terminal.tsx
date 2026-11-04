import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

export interface TerminalLine {
  /** A command (drawn after a prompt, copyable), the output it printed, or a comment. */
  kind: 'command' | 'output' | 'comment'
  text: string
}

/** A terminal transcript: real commands and what they print. Commands can be copied. */
export function Terminal({ lines, title, className }: { lines: TerminalLine[]; title?: string; className?: string }) {
  const commands = lines.filter((l) => l.kind === 'command').map((l) => l.text)
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-terminal-bg text-terminal-fg', className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2 font-mono text-xs text-term-8">
          <span>{title}</span>
          {commands.length > 0 && <CopyButton text={commands.join('\n')} />}
        </div>
      )}
      <pre className="p-4 font-mono text-sm leading-relaxed break-words whitespace-pre-wrap">
        {lines.map((line, i) => (
          <div key={i} className={cn(line.kind === 'comment' && 'text-term-8', line.kind === 'output' && 'text-term-7')}>
            {line.kind === 'command' && <span className="text-term-2 select-none">$ </span>}
            {line.text}
          </div>
        ))}
      </pre>
    </div>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={copied ? 'Copied' : 'Copy the commands'}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  )
}
