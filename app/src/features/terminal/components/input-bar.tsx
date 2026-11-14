import { ImagePlus, Plus, SendHorizontal } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import type { Track } from '@/lib/use-outbox'
import { useSendInput } from '../api/use-terminal'
import { useAttachments } from '../hooks/use-attachments'
import { useComposerPanel, usePanelSwipe } from '../hooks/use-composer-panel'
import { useGuardedKeys } from '../hooks/use-guarded-keys'
import { base64, imagesIn } from '../images'
import { withQuotes, type Quote } from '../quotes'
import { draftKey as keyOf, useDrafts } from '../store'
import { ImageCards } from './image-cards'
import { KeyPad, PAD_KEYS } from './key-pad'
import { QuoteCards } from './quote-cards'
import { submitters } from '../draft-box'
import { useTokenMenu, type TokenSource } from '@/components/ui/token-menu'
import { composerField, composerText } from '@/components/ui/composer-field'
import { FilePicker } from '@/components/ui/file-picker'
import { look } from '@/components/ui/intents'
import { Fold } from '@/components/ui/fold'
import { keepFocus } from '@/components/ui/gesture'

const NO_QUOTES: Quote[] = []
const TOUCH = '(pointer: coarse)' // a phone: its keyboard covers half the screen, its return key is a new line

/** One row: the keys toggle, the message textarea (sent followed by Enter) and Send. The keys a phone
 *  keyboard lacks open above it, and stay open or closed as last left. What the message quotes (text
 *  selected and replied to) waits above the textarea, apart from what is typed, each with its own remove and
 *  reply (`QuoteCards`), and goes first in the message (`withQuotes`). What is typed and quoted is kept
 *  per session until it is sent (`useDrafts`). With `track` (a session whose conversation is shown), a
 *  message leaves the textarea at once and waits at the end of the conversation (`useOutgoing`); if it
 *  cannot be sent, it comes back into the textarea. Enter sends with a keyboard; on a phone, return is a new line and Send sends, so
 *  the keyboard can be put away and more quoted first. `keys`: the key names this session accepts; empty
 *  means all of them. `images`: the session takes pictures with a message (pasted, dropped or picked;
 *  `useAttachments`), shown above the words. Other features add to it: `extra` beside Send (the microphone), and `cover`, shown
 *  instead of the row while it is there (speaking). */
export function InputBar({
  daemonId,
  sessionId,
  keys = [],
  images = false,
  track,
  extra,
  cover,
  mention,
  guard,
}: {
  daemonId: string
  sessionId: string
  keys?: string[]
  images?: boolean
  track?: Track
  extra?: ReactNode
  cover?: ReactNode
  /** What `@` offers to mention, in the textarea and in each quote's reply (from another feature, as a slot). */
  mention?: TokenSource
  /** Why a key of the pad should ask before it goes (a second tap sends it), or null: `useGuardedKeys`. */
  guard?: (key: string) => string | null
}) {
  const send = useSendInput(daemonId, sessionId)
  const draftKey = keyOf(daemonId, sessionId)
  const draft = useDrafts((s) => s.drafts[draftKey] ?? '')
  const setDraft = useDrafts((s) => s.setDraft)
  const setText = (value: string) => setDraft(draftKey, value)
  const quotes = useDrafts((s) => s.quotes[draftKey]) ?? NO_QUOTES
  const setQuotes = useDrafts((s) => s.setQuotes)
  const message = withQuotes(quotes, draft)
  const touch = useMediaQuery(TOUCH)
  const pictures = useAttachments()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const lastReply = useDrafts((s) => s.quoted[draftKey])
  // Replies made since this textarea showed (not one from before, coming back to the session): its card
  // opens, its own reply focused (`QuoteCards`).
  const shownAt = useRef(lastReply?.n ?? 0)
  const replied = lastReply && lastReply.n > shownAt.current ? lastReply : undefined
  // Only quotes, nothing written: a first Enter does not send them, it goes on to the line to write
  // (`armed`); a second one sends them as they are. Writing anything, or quoting more, starts over.
  const quoteOnly = quotes.length > 0 && !draft.trim() && quotes.every((q) => !q.reply.trim()) && !pictures.items.length
  const [armed, setArmed] = useState(false)
  useEffect(() => setArmed(false), [message])
  const filled = useDrafts((s) => s.filled[draftKey] ?? 0)
  const seenFill = useRef(filled)
  useEffect(() => {
    // Filled in from outside (a code block as a command): there to read and send, from its end.
    if (filled === seenFill.current) return
    seenFill.current = filled
    const el = textarea.current
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
  }, [filled])
  // The + panel (keys; pictures on a phone): this session's while its page shows, never kept; a swipe up
  // on the composer opens it, down closes it (touch).
  const [open, setOpen] = useComposerPanel(draftKey)
  const composer = useRef<HTMLDivElement>(null)
  usePanelSwipe(composer, open, setOpen)
  const narrow = useMediaQuery(PHONE_QUERY) // a phone's row: pictures go to the + panel
  const guarded = useGuardedKeys(guard ?? (() => null), (key) => send.mutate({ key }))
  const guardedKeys = guard ? PAD_KEYS.filter((k) => guard(k)) : []
  const picker = useRef<HTMLInputElement>(null)

  /** With pictures: they and the words leave the textarea together, and come back to it if not sent. */
  /** What the textarea holds now, from the store: written from outside (Live mode) just before a send, it is
   *  there before this textarea has rendered it. */
  const now = () => {
    const state = useDrafts.getState()
    const nowText = state.drafts[draftKey] ?? ''
    const nowQuotes = state.quotes[draftKey] ?? NO_QUOTES
    return { text: nowText, quotes: nowQuotes, message: withQuotes(nowQuotes, nowText) }
  }

  const submitPictures = async () => {
    const { text, quotes, message } = now()
    const [sentText, sentQuotes, taken] = [text, quotes, pictures.take()]
    setText('')
    setQuotes(draftKey, [])
    const back = () => {
      const now = useDrafts.getState()
      setText([sentText, now.drafts[draftKey] ?? ''].filter(Boolean).join('\n'))
      setQuotes(draftKey, [...sentQuotes, ...(now.quotes[draftKey] ?? [])])
      pictures.restore(taken)
    }
    try {
      const encoded = await Promise.all(taken.map(async (a) => ({ media_type: a.type, data: await base64(a.blob) })))
      send.mutate({ text: message, enter: true, images: encoded }, { onError: back })
    } catch {
      back()
    }
  }

  const submit = () => {
    if (pictures.pending) return // a picture is still being made small: Send waits for it
    if (pictures.items.length) return void submitPictures()
    const { text, quotes, message } = now()
    if (!message) return
    const [sentText, sentQuotes] = [text, quotes]
    const tracked = track?.(message)
    if (tracked) {
      // Shown in the conversation already, as on its way.
      setText('')
      setQuotes(draftKey, [])
    }
    send.mutate(
      { text: message, enter: true },
      {
        onSuccess: () => {
          if (tracked) return tracked.sent()
          // Typed on (or quoted more) while it was sending: keep what is newer.
          const now = useDrafts.getState()
          if ((now.drafts[draftKey] ?? '') === sentText) setText('')
          if (now.quotes[draftKey] === sentQuotes) setQuotes(draftKey, [])
        },
        onError: () => {
          if (!tracked) return // it never left the textarea
          tracked.failed()
          // Back in the textarea, ahead of anything typed since.
          const now = useDrafts.getState()
          setText([sentText, now.drafts[draftKey] ?? ''].filter(Boolean).join('\n'))
          setQuotes(draftKey, [...sentQuotes, ...(now.quotes[draftKey] ?? [])])
        },
      },
    )
  }

  /** In a quote's own reply: Enter goes on to the message textarea, the caret at its end (sending is from there);
   *  Shift+Enter, an input method's Enter, and return on a phone are new lines. */
  const replyKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const picking = e.nativeEvent.isComposing || e.keyCode === 229
    if (e.key !== 'Enter' || e.shiftKey || picking || touch) return
    e.preventDefault()
    const el = textarea.current
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
  }

  const mentions = useTokenMenu(mention, textarea, draft, setText)
  // Words written in from outside (Live mode): the textarea's border glows a moment, in place of an echo.
  const landed = useDrafts((s) => s.landed[draftKey] ?? 0)
  const [glow, setGlow] = useState(false)
  const seenLanding = useRef(landed)
  useEffect(() => {
    if (landed === seenLanding.current) return
    seenLanding.current = landed
    setGlow(true)
    const timer = setTimeout(() => setGlow(false), 900)
    return () => clearTimeout(timer)
  }, [landed])

  // Send from outside the page (Live mode's "send"), exactly as the Send button does.
  const submitNow = useRef<() => 'sent' | 'empty'>(() => 'empty')
  submitNow.current = () => {
    if (!now().message.trim() && !pictures.items.length) return 'empty'
    submit()
    return 'sent'
  }
  useEffect(() => {
    submitters.set(draftKey, () => submitNow.current())
    return () => void submitters.delete(draftKey)
  }, [draftKey])

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentions.onKeyDown(e)) return // the mention menu's: Up/Down, Enter/Tab to insert, Esc
    // Not the Enter that picks an input method's word (Safari ends the composition first: 229).
    const picking = e.nativeEvent.isComposing || e.keyCode === 229
    if (e.key !== 'Enter' || e.shiftKey || picking) return
    if (quoteOnly && !armed) {
      // A quote alone is never sent by a stray Enter: on to the line under it, to write the reply.
      e.preventDefault()
      setArmed(true)
      const el = textarea.current
      el?.focus()
      el?.setSelectionRange(el.value.length, el.value.length)
      return
    }
    if (!touch) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div ref={composer} className="flex flex-col gap-2">
      {send.isError ? (
        <Banner tone="error" aligned>
          {send.error.message}
        </Banner>
      ) : null}
      {pictures.error ? (
        <Banner tone="error" aligned>
          {pictures.error}
        </Banner>
      ) : null}
      {/* The + panel, the swap for the row while speaking, and the row: no gap of their own, so the panel's
          fold (its own padding below) is all that moves; the row never jumps. */}
      <div className="flex flex-col">
        <Fold open={open}>
          <div className="flex flex-col gap-2 pb-2">
            {images && narrow ? (
              // A phone's row is narrow: pictures are here, beside the keys (pasting or dropping still works).
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onPointerDown={keepFocus}
                onClick={() => picker.current?.click()}
              >
                <ImagePlus /> Add pictures
              </Button>
            ) : null}
            {guarded.hint ? (
              <Banner tone="warning" aligned>
                {guarded.hint}
              </Banner>
            ) : null}
            <KeyPad keys={keys} guarded={guardedKeys} onKey={guarded.press} />
          </div>
        </Fold>
        {cover ? <div className="flex items-end">{cover}</div> : null}
        <form
          hidden={!!cover}
          className="flex items-end gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Button
            variant={open ? 'secondary' : 'ghost'}
            size="icon"
            aria-label={
              open ? (images && narrow ? 'Hide keys and pictures' : 'Hide keys') : images && narrow ? 'Show keys and pictures' : 'Show keys'
            }
            aria-expanded={open}
            title={open ? 'Hide keys' : 'Keys: esc, tab, arrows, enter…'}
            className="shrink-0"
            onPointerDown={keepFocus} // keep the phone keyboard as it is
            onClick={() => setOpen(!open)}
          >
            <Plus className={cn(look.turning, open && 'rotate-45')} />
          </Button>
          {/* One box: the pictures and what the message quotes on top, then what is typed. */}
          <div
            data-landed={glow || undefined}
            className={composerField({ glow })}
            onDragOver={(e) => images && e.dataTransfer.types.includes('Files') && e.preventDefault()}
            onDrop={(e) => {
              const dropped = images ? imagesIn(e.dataTransfer.files) : []
              if (!dropped.length) return
              e.preventDefault()
              void pictures.add(dropped)
            }}
          >
            {pictures.items.length || pictures.pending ? (
              <ImageCards items={pictures.items} pending={pictures.pending} onRemove={pictures.remove} />
            ) : null}
            {quotes.length ? (
              <QuoteCards
                quotes={quotes}
                onChange={(list) => setQuotes(draftKey, list)}
                onKeyDown={replyKeyDown}
                replied={replied}
                mention={mention}
                draftKey={draftKey}
              />
            ) : null}
            <Textarea
              ref={textarea}
              rows={1}
              enterKeyHint={touch ? 'enter' : 'send'}
              value={draft}
              placeholder={
                !quotes.length ? 'Message the agent' : armed && !touch ? 'Add a message, or Enter again to send' : 'Add a message'
              }
              aria-label="Message the agent"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={keyDown}
              onSelect={mentions.sync}
              onBlur={mentions.close}
              onPaste={(e) => {
                const pasted = images ? imagesIn(e.clipboardData.files) : []
                if (!pasted.length) return
                e.preventDefault() // a screenshot: attached, not its file name typed
                void pictures.add(pasted)
              }}
              bare
              className={composerText}
            />
            {mentions.menu}
          </div>
          {images ? (
            <>
              <FilePicker
                ref={picker}
                accept="image/*"
                multiple
                onChange={(e) => {
                  void pictures.add(imagesIn(e.target.files))
                  e.target.value = ''
                  setOpen(false) // pictures added: the panel has done its part
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className={cn('shrink-0', narrow && 'hidden')}
                aria-label="Add pictures"
                title="Add pictures (or paste or drop them in the textarea)"
                onPointerDown={keepFocus}
                onClick={() => picker.current?.click()}
              >
                <ImagePlus />
              </Button>
            </>
          ) : null}
          {extra}
          <Button
            type="submit"
            size="icon"
            className="shrink-0"
            aria-label="Send"
            disabled={send.isPending || pictures.pending > 0 || (!message && !pictures.items.length)}
          >
            <SendHorizontal />
          </Button>
        </form>
      </div>
    </div>
  )
}
