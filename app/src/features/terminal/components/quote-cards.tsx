import { CornerDownRight, X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import type { Quote } from '../quotes'

/** The quotes waiting above the message box, a card each. A tap opens one to the whole quote and a box
 *  for a reply to that part alone; closed, a card shows the start of its reply under it. Each has its
 *  remove. `onKeyDown`: what the message box does with a key (Enter sends), for the reply boxes too. */
export function QuoteCards({
  quotes,
  onChange,
  onKeyDown,
}: {
  quotes: Quote[]
  onChange: (quotes: Quote[]) => void
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const [open, setOpen] = useState<string | null>(null) // by its text: a quote is there once
  const update = (i: number, reply: string) => onChange(quotes.map((q, j) => (j === i ? { ...q, reply } : q)))

  return (
    <ul aria-label="Quoted" className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto">
      {quotes.map((quote, i) => {
        const opened = open === quote.text
        return (
          <li key={quote.text} className="rounded-md border-l-2 border-accent bg-surface-muted text-xs">
            <div className="flex items-start gap-1">
              <button
                type="button"
                aria-expanded={opened}
                title={opened ? 'Close' : 'Reply to this part'}
                className="flex min-w-0 flex-1 flex-col gap-0.5 py-1.5 pl-2.5 text-left"
                onClick={() => setOpen(opened ? null : quote.text)}
              >
                <span className={cn('whitespace-pre-line text-fg-muted', !opened && 'line-clamp-2')}>{quote.text}</span>
                {!opened && quote.reply.trim() ? (
                  <span className="flex min-w-0 items-center gap-1 text-fg">
                    <CornerDownRight className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{quote.reply}</span>
                  </span>
                ) : null}
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove quote"
                className="shrink-0"
                onPointerDown={(e) => e.preventDefault()} // keep the phone keyboard as it is
                onClick={() => onChange(quotes.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </div>
            {opened ? (
              <div className="px-2 pb-2">
                <Textarea
                  autoFocus
                  rows={1}
                  value={quote.reply}
                  placeholder="Reply to this part"
                  aria-label="Reply to this quote"
                  onChange={(e) => update(i, e.target.value)}
                  onKeyDown={onKeyDown}
                  className="max-h-28 field-sizing-content"
                />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
