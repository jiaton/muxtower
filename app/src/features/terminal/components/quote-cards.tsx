import { CornerDownRight, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Textarea } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { useTokenMenu, type TokenSource } from '@/components/ui/token-menu'
import type { Quote } from '../quotes'
import { Button } from '@/components/ui/button'
import { ink, look, quoteCard } from '@/components/ui/intents'
import { keepFocus } from '@/components/ui/gesture'

/** The quotes of a message, at the top of its box, a line each. A tap opens one to the whole quote and a
 *  reply to that part alone, written right under it; closed, the start of its reply shows under it. Each
 *  has its remove. `onKeyDown`: what a key does in a reply (Enter goes on to the message box). `replied`:
 *  the quote just replied to (Reply on a selection): its card opens, the others close, its reply focused. */
export function QuoteCards({
  quotes,
  onChange,
  onKeyDown,
  replied,
  mention,
  draftKey,
}: {
  quotes: Quote[]
  onChange: (quotes: Quote[]) => void
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  replied?: { n: number; text: string }
  mention?: TokenSource
  /** The message's draft, named on each reply field (`data-draft`), with its quote (`data-quote`). */
  draftKey?: string
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
          <li key={quote.text} className={`${quoteCard({ open: opened })} flex gap-2 py-1.5 pr-1 pl-2`}>
            <span className={`${look.quoteBar} w-0.5 shrink-0 self-stretch`} aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Button
                variant="plain"
                aria-expanded={opened}
                title={opened ? 'Close' : 'Reply to this part'}
                className="flex min-w-0 flex-col gap-0.5 text-left"
                onClick={() => setOpen(opened ? null : quote.text)}
              >
                <span className={cn(`${ink.quiet} whitespace-pre-line`, !opened && 'line-clamp-1')}>{quote.text}</span>
                {!opened && quote.reply.trim() ? (
                  <span className={`${ink.normal} flex min-w-0 items-center gap-1`}>
                    <CornerDownRight className={`${ink.accent} size-3 shrink-0`} aria-hidden />
                    <span className="truncate">{quote.reply}</span>
                  </span>
                ) : null}
              </Button>
              {opened ? (
                <div className="flex items-start gap-1">
                  <CornerDownRight className={`${ink.accent} mt-1.5 size-3 shrink-0`} aria-hidden />
                  <ReplyField
                    field={(el) => void (el ? replies.current.set(quote.text, el) : replies.current.delete(quote.text))}
                    value={quote.reply}
                    onChange={(reply) => update(i, reply)}
                    onKeyDown={onKeyDown}
                    mention={mention}
                    quote={quote.text}
                    draftKey={draftKey}
                  />
                </div>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              round
              aria-label="Remove quote"
              className="shrink-0"
              onPointerDown={keepFocus} // keep the phone keyboard as it is
              onClick={() => onChange(quotes.filter((_, j) => j !== i))}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

/** A quote's own reply, with the mention menu of the message box. */
function ReplyField({
  field,
  value,
  onChange,
  onKeyDown,
  mention,
  quote,
  draftKey,
}: {
  field: (el: HTMLTextAreaElement | null) => void
  value: string
  onChange: (value: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  mention?: TokenSource
  quote: string
  draftKey?: string
}) {
  const el = useRef<HTMLTextAreaElement | null>(null)
  const mentions = useTokenMenu(mention, el, value, onChange)
  return (
    <div className="min-w-0 flex-1">
      <Textarea
        ref={(node) => {
          el.current = node
          field(node)
        }}
        autoFocus
        rows={1}
        value={value}
        placeholder="Reply to this part"
        aria-label="Reply to this quote"
        data-quote={quote}
        data-draft={draftKey}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => mentions.onKeyDown(e) || onKeyDown(e)}
        onSelect={mentions.sync}
        onBlur={mentions.close}
        bare
        className="max-h-28 min-h-0 field-sizing-content px-0 py-0.5"
      />
      {mentions.menu}
    </div>
  )
}
