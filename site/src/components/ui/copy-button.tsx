import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'

/** Copies `text`, and says so for a moment. */
export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!(await copyText(text))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-focus [&_svg]:size-4',
        className,
      )}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </button>
  )
}
