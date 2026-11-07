import { CornerDownRight, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Textarea } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import type { Quote } from '../quotes'

/** The quotes of a message, at the top of its box, a line each. A tap opens one to the whole quote and a
 *  reply to that part alone, written right under it; closed, the start of its reply shows under it. Each
 *  has its remove. `onKeyDown`: what a key does in a reply (Enter goes on to the message box). `replied`:
 *  the quote just replied to (Reply on a selection): its card opens, the others close, its reply focused. */
export function QuoteCards({
  quotes,
  onChange,
  onKeyDown,
  replied,
}: {
  quotes: Quote[]
  onChange: (quotes: Quote[]) => void
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  replied?: { n: number; text: string }
}) {
  const [open, setOpen] = useState<string | null>(null) // by its text: a quote is there once
  const replies = useRef(new Map<string, HTMLTextAreaElement>())
  const seen = useRef<number | undefined>(undefined) // the last Reply acted on: a card shown for one opens
  const [focusing, setFocusing] = useState<string | null>(null)
  useEffect(() => {
    if (!replied || replied.n === seen.current) return
    seen.current = replied.n
    setOpen(replied.text)
    setFocusing(replied.text)
  }, [replied])
  useEffect(() => {
    // Once its card is open: its reply, the caret after what it has (on a phone too; its keyboard may stay down).
    const el = focusing ? replies.current.get(focusing) : undefined
    if (!el) return
    el.focus({ preventScroll: false })
    el.setSelectionRange(el.value.length, el.value.length)
    setFocusing(null)
  }, [focusing, open])
  const update = (i: number, reply: string) => onChange(quotes.map((q, j) => (j === i ? { ...q, reply } : q)))

  return (
    <ul aria-label="Quoted" className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto p-1.5 pb-0">
      {quotes.map((quote, i) => {
        const opened = open === quote.text
        return (
          <li
            key={quote.text}
            className={cn('flex gap-2 rounded-lg py-1.5 pr-1 pl-2 text-sm', opened ? 'bg-surface-muted' : 'hover:bg-surface-muted/60')}
          >
            <span className="w-0.5 shrink-0 self-stretch rounded-full bg-accent" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <button
                type="button"
                aria-expanded={opened}
                title={opened ? 'Close' : 'Reply to this part'}
                className="flex min-w-0 flex-col gap-0.5 text-left"
                onClick={() => setOpen(opened ? null : quote.text)}
              >
                <span className={cn('whitespace-pre-line text-fg-muted', !opened && 'line-clamp-1')}>{quote.text}</span>
                {!opened && quote.reply.trim() ? (
                  <span className="flex min-w-0 items-center gap-1 text-fg">
                    <CornerDownRight className="size-3 shrink-0 text-accent" aria-hidden />
                    <span className="truncate">{quote.reply}</span>
                  </span>
                ) : null}
              </button>
              {opened ? (
                <div className="flex items-start gap-1">
                  <CornerDownRight className="mt-1.5 size-3 shrink-0 text-accent" aria-hidden />
                  <Textarea
                    ref={(el) => void (el ? replies.current.set(quote.text, el) : replies.current.delete(quote.text))}
                    autoFocus
                    rows={1}
                    value={quote.reply}
                    placeholder="Reply to this part"
                    aria-label="Reply to this quote"
                    onChange={(e) => update(i, e.target.value)}
                    onKeyDown={onKeyDown}
                    className="max-h-28 min-h-0 field-sizing-content rounded-none border-0 bg-transparent px-0 py-0.5 focus-visible:outline-none"
                  />
                </div>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Remove quote"
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-muted hover:text-fg"
              onPointerDown={(e) => e.preventDefault()} // keep the phone keyboard as it is
              onClick={() => onChange(quotes.filter((_, j) => j !== i))}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
