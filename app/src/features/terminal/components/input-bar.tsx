import { Plus, SendHorizontal, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/use-media-query'
import { useSendInput } from '../api/use-terminal'
import { withQuotes } from '../quotes'
import { draftKey as keyOf, useDrafts, useTerminalPrefs } from '../store'
import { KeyPad } from './key-pad'

const NO_QUOTES: string[] = []
const TOUCH = '(pointer: coarse)' // a phone: its keyboard covers half the screen, its return key is a new line

/** One row: the keys toggle, the message box (sent followed by Enter) and Send. The keys a phone
 *  keyboard lacks open above it, and stay open or closed as last left. What the message quotes (text
 *  selected and replied to) waits above the box, apart from what is typed, each with its own remove, and
 *  goes first in the message (`withQuotes`). What is typed and quoted is kept per session until it is
 *  sent (`useDrafts`). Enter sends with a keyboard; on a phone, return is a new line and Send sends, so
 *  the keyboard can be put away and more quoted first. `keys`: the key names this session accepts; empty
 *  means all of them. */
export function InputBar({ daemonId, sessionId, keys = [] }: { daemonId: string; sessionId: string; keys?: string[] }) {
  const send = useSendInput(daemonId, sessionId)
  const draftKey = keyOf(daemonId, sessionId)
  const text = useDrafts((s) => s.drafts[draftKey] ?? '')
  const setDraft = useDrafts((s) => s.setDraft)
  const setText = (value: string) => setDraft(draftKey, value)
  const quotes = useDrafts((s) => s.quotes[draftKey]) ?? NO_QUOTES
  const setQuotes = useDrafts((s) => s.setQuotes)
  const message = withQuotes(quotes, text)
  const touch = useMediaQuery(TOUCH)
  const box = useRef<HTMLTextAreaElement>(null)
  const quoted = useRef(quotes.length)
  useEffect(() => {
    // Just quoted: reply to it. Not on a phone, whose keyboard would cover what there is to quote next.
    if (quotes.length > quoted.current && !touch) box.current?.focus()
    quoted.current = quotes.length
  }, [quotes.length])
  const open = useTerminalPrefs((s) => s.keypad)
  const setOpen = useTerminalPrefs((s) => s.setKeypad)

  const submit = () => {
    if (!message) return
    const [sentText, sentQuotes] = [text, quotes]
    // Typed on (or quoted more) while it was sending: keep what is newer.
    send.mutate(
      { text: message, enter: true },
      {
        onSuccess: () => {
          const now = useDrafts.getState()
          if ((now.drafts[draftKey] ?? '') === sentText) setText('')
          if (now.quotes[draftKey] === sentQuotes) setQuotes(draftKey, [])
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {send.isError ? <Banner tone="error">{send.error.message}</Banner> : null}
      {open ? <KeyPad keys={keys} onKey={(key) => send.mutate({ key })} /> : null}
      {quotes.length ? (
        <ul aria-label="Quoted" className="flex max-h-32 flex-col gap-1 overflow-y-auto">
          {quotes.map((quote, i) => (
            <li
              key={quote}
              className="flex items-start gap-1 rounded-md border-l-2 border-accent bg-surface-muted py-1 pl-2.5 text-xs text-fg-muted"
            >
              <span className="line-clamp-2 min-w-0 flex-1 py-0.5 whitespace-pre-line">{quote}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove quote"
                className="shrink-0"
                onPointerDown={(e) => e.preventDefault()} // keep the phone keyboard as it is
                onClick={() =>
                  setQuotes(
                    draftKey,
                    quotes.filter((_, j) => j !== i),
                  )
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label={open ? 'Hide keys' : 'Show keys'}
          aria-expanded={open}
          title={open ? 'Hide keys' : 'Keys: esc, tab, arrows, enter…'}
          className={cn('shrink-0', open && 'bg-surface-muted text-fg')}
          onPointerDown={(e) => e.preventDefault()} // keep the phone keyboard as it is
          onClick={() => setOpen(!open)}
        >
          <Plus className={cn('transition-transform', open && 'rotate-45')} />
        </Button>
        <Textarea
          ref={box}
          rows={1}
          enterKeyHint={touch ? 'enter' : 'send'}
          value={text}
          placeholder="Message the agent"
          aria-label="Message the agent"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Not the Enter that picks an input method's word (Safari ends the composition first: 229).
            const picking = e.nativeEvent.isComposing || e.keyCode === 229
            if (e.key === 'Enter' && !e.shiftKey && !touch && !picking) {
              e.preventDefault()
              submit()
            }
          }}
          className="max-h-40 field-sizing-content"
        />
        <Button type="submit" size="icon" className="shrink-0" aria-label="Send" disabled={send.isPending || !message}>
          <SendHorizontal />
        </Button>
      </form>
    </div>
  )
}
