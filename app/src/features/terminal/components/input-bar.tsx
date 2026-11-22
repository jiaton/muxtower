import { Plus, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import type { Track } from '@/lib/use-outbox'
import { MAC, SEND_KEYS } from '@/lib/send-keys'
import { setSuggestionTaker } from '@/lib/suggestion-key'
import { useAcceptSuggestion, useSendInput } from '../api/use-terminal'
import { useAttachments } from '../hooks/use-attachments'
import { useFiles } from '../hooks/use-files'
import { useComposerPanel, usePanelSwipe } from '../hooks/use-composer-panel'
import { useGuardedKeys } from '../hooks/use-guarded-keys'
import { useComposerKeys } from '../hooks/use-composer-keys'
import { base64, imagesIn } from '../images'
import { withQuotes, type Quote } from '../quotes'
import { draftKey as keyOf, useDrafts } from '../store'
import { ImageCards } from './image-cards'
import { AttachmentRow, FileCards } from './file-cards'
import { AttachPickers, PanelAttach, SendButton } from './composer-controls'
import { KeyPad, PAD_KEYS } from './key-pad'
import { QuoteCards } from './quote-cards'
import { submitters } from '../draft-box'
import { useTokenMenu, type TokenSource } from '@/components/ui/token-menu'
import { composerField, composerText } from '@/components/ui/composer-field'
import { look } from '@/components/ui/intents'
import { Fold } from '@/components/ui/fold'
import { keepFocus } from '@/components/ui/gesture'
import { useAttachPickers } from '@/lib/attach-picker'

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
 *  `useAttachments`), shown above the words. Any other file (every file, where it takes no pictures) is
 *  uploaded as it is added and goes with the message by id (`useFiles`); Send waits for uploads on their way. Other features add to it: `extra` beside Send (the microphone), and `cover`, shown
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
  suggestion,
  keySends = true,
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
  /** The prompt the agent suggests while it waits at its prompt: Send on the empty box sends it, and ⌘↵
   *  too unless `keySends` is false (Live on: there ⌘↵ sends what is being said). */
  suggestion?: string | null
  keySends?: boolean
}) {
  const send = useSendInput(daemonId, sessionId)
  const accept = useAcceptSuggestion(daemonId, sessionId)
  const draftKey = keyOf(daemonId, sessionId)
  const draft = useDrafts((s) => s.drafts[draftKey] ?? '')
  const setDraft = useDrafts((s) => s.setDraft)
  const setText = (value: string) => setDraft(draftKey, value)
  const quotes = useDrafts((s) => s.quotes[draftKey]) ?? NO_QUOTES
  const setQuotes = useDrafts((s) => s.setQuotes)
  const message = withQuotes(quotes, draft)
  const touch = useMediaQuery(TOUCH)
  const pictures = useAttachments()
  const files = useFiles(daemonId, sessionId)
  /** Files added (picked, pasted, dropped): pictures as pictures where the session takes them, the rest
   *  uploaded. */
  const attach = (list: FileList | File[] | null | undefined) => {
    const all = Array.from(list ?? [])
    const shown = images ? imagesIn(all) : []
    if (shown.length) void pictures.add(shown)
    files.add(all.filter((f) => !shown.includes(f)))
  }
  const attached = pictures.items.length + files.ready
  const textarea = useRef<HTMLTextAreaElement>(null)
  const lastReply = useDrafts((s) => s.quoted[draftKey])
  // Replies made since this textarea showed (not one from before, coming back to the session): its card
  // opens, its own reply focused (`QuoteCards`).
  const shownAt = useRef(lastReply?.n ?? 0)
  const replied = lastReply && lastReply.n > shownAt.current ? lastReply : undefined
  // Only quotes, nothing written: a first Enter does not send them, it goes on to the line to write
  // (`armed`); a second one sends them as they are. Writing anything, or quoting more, starts over.
  const quoteOnly =
    quotes.length > 0 && !draft.trim() && quotes.every((q) => !q.reply.trim()) && !pictures.items.length && !files.items.length
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
  const picker = useRef<HTMLInputElement>(null) // any file
  const picturePicker = useRef<HTMLInputElement>(null) // a phone's own picture choices (camera, photos)
  const setPicker = useAttachPickers((s) => s.set)
  useEffect(() => {
    setPicker(draftKey, () => picker.current?.click()) // ⌘K's "Attach a file…"
    return () => setPicker(draftKey, null)
  }, [draftKey, setPicker])

  /** What the textarea holds now, from the store: written from outside (Live mode) just before a send, it is
   *  there before this textarea has rendered it. */
  const now = () => {
    const state = useDrafts.getState()
    const nowText = state.drafts[draftKey] ?? ''
    const nowQuotes = state.quotes[draftKey] ?? NO_QUOTES
    return { text: nowText, quotes: nowQuotes, message: withQuotes(nowQuotes, nowText) }
  }

  /** With pictures or files: they and the words leave the textarea together, and come back to it if not
   *  sent. */
  const submitAttached = async () => {
    const { text, quotes, message } = now()
    const [sentText, sentQuotes, taken, takenFiles] = [text, quotes, pictures.take(), files.take()]
    setText('')
    setQuotes(draftKey, [])
    const back = () => {
      const now = useDrafts.getState()
      setText([sentText, now.drafts[draftKey] ?? ''].filter(Boolean).join('\n'))
      setQuotes(draftKey, [...sentQuotes, ...(now.quotes[draftKey] ?? [])])
      pictures.restore(taken)
      files.restore(takenFiles)
    }
    try {
      const encoded = await Promise.all(taken.map(async (a) => ({ media_type: a.type, data: await base64(a.blob) })))
      const ids = takenFiles.flatMap((f) => (f.attachment ? [f.attachment.id] : []))
      send.mutate({ text: message, enter: true, images: encoded, ...(ids.length ? { attachments: ids } : {}) }, { onError: back })
    } catch {
      back()
    }
  }

  // Send pressed while files are still uploading: it goes once they are done (or failed, or removed).
  const [waiting, setWaiting] = useState(false)
  const submit = () => {
    if (pictures.pending) return // a picture is still being made small: Send waits for it
    if (files.uploading) return setWaiting(true)
    setWaiting(false)
    if (attached) return void submitAttached()
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
        onSuccess: (result) => {
          if (tracked) return tracked.sent(result)
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
  const editing = useComposerKeys(textarea, draftKey, draft, setText) // Ctrl+U, ↑/↓ through what was sent
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
    if (!now().message.trim() && !pictures.items.length && !files.items.length) return 'empty'
    submit()
    return 'sent'
  }
  useEffect(() => {
    submitters.set(draftKey, () => submitNow.current())
    return () => void submitters.delete(draftKey)
  }, [draftKey])
  const submitLater = useRef(submit)
  submitLater.current = submit
  useEffect(() => {
    if (waiting && !files.uploading) submitLater.current()
  }, [waiting, files.uploading])

  // Nothing in the box (no words, quotes or pictures): ⌘↵ sends the agent's suggestion, if one shows.
  const empty = !draft.trim() && !quotes.length && !pictures.items.length && !files.items.length
  // Taken: gone from here at once, and not taken again until the screen shows a suggestion anew (a second
  // ⌘↵ would only be refused: the agent is at work on the first).
  const [taken, setTaken] = useState<string | null>(null)
  useEffect(() => {
    if (suggestion !== taken) setTaken(null)
  }, [suggestion, taken])
  const offered = empty && suggestion && suggestion !== taken ? suggestion : null
  const takeRef = useRef<() => boolean>(() => false)
  takeRef.current = () => {
    if (!offered || accept.isPending) return false
    setTaken(offered)
    accept.mutate(offered)
    return true
  }
  // Live's ⌘↵ (it comes first) takes it through here when Live is idle.
  useEffect(() => {
    if (!offered) return
    setSuggestionTaker(() => takeRef.current())
    return () => setSuggestionTaker(null)
  }, [offered])
  // A suggestion not taken (the screen changed under it) says so for a moment, then goes.
  useEffect(() => {
    if (!accept.isError) return
    const timer = setTimeout(() => accept.reset(), BANNER_MS)
    return () => clearTimeout(timer)
  }, [accept.isError, accept])

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentions.onKeyDown(e)) return // the mention menu's: Up/Down, Enter/Tab to insert, Esc
    if (editing.onKeyDown(e)) return
    const command = MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
    if (e.key === 'Enter' && command && !e.shiftKey && !e.altKey && keySends && takeRef.current()) {
      e.preventDefault()
      return
    }
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
      editing.recordSend()
      submit()
    }
  }

  return (
    <div ref={composer} className="flex flex-col gap-2">
      {send.isError ? (
        <Banner tone="error" aligned action={<Dismiss onClick={() => send.reset()} />}>
          {send.error.message}
        </Banner>
      ) : null}
      {accept.isError ? (
        <Banner tone="error" aligned action={<Dismiss onClick={() => accept.reset()} />}>
          Not sent: {accept.error.message}
        </Banner>
      ) : null}
      {pictures.error ? (
        <Banner tone="error" aligned action={<Dismiss onClick={pictures.dismissError} />}>
          {pictures.error}
        </Banner>
      ) : null}
      {files.notice ? (
        <Banner tone="error" aligned action={<Dismiss onClick={files.dismissNotice} />}>
          {files.notice}
        </Banner>
      ) : null}
      {/* The + panel, the swap for the row while speaking, and the row: no gap of their own, so the panel's
          fold (its own padding below) is all that moves; the row never jumps. */}
      <div className="flex flex-col">
        <Fold open={open}>
          <div className="flex flex-col gap-2 pb-2">
            {narrow ? <PanelAttach any={picker} pictures={images ? picturePicker : undefined} /> : null}
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
            if (takeRef.current()) return // the box empty: Send takes the agent's suggestion
            editing.recordSend()
            submit()
          }}
        >
          <Button
            variant={open ? 'secondary' : 'ghost'}
            size="icon"
            aria-label={`${open ? 'Hide' : 'Show'} keys${narrow ? (images ? ', pictures and files' : ' and files') : ''}`}
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
            onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
            onDrop={(e) => {
              if (!e.dataTransfer.files.length) return
              e.preventDefault()
              attach(e.dataTransfer.files)
            }}
          >
            {pictures.items.length || pictures.pending || files.items.length ? (
              <AttachmentRow>
                {pictures.items.length || pictures.pending ? (
                  <ImageCards items={pictures.items} pending={pictures.pending} onRemove={pictures.remove} />
                ) : null}
                {files.items.length ? <FileCards items={files.items} onRetry={files.retry} onRemove={files.remove} /> : null}
              </AttachmentRow>
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
              data-component="message box"
              rows={1}
              enterKeyHint={touch ? 'enter' : 'send'}
              value={draft}
              placeholder={
                offered
                  ? touch || !keySends
                    ? `Send takes: ${offered}`
                    : `${SEND_KEYS} or Send: ${offered}`
                  : !quotes.length
                    ? 'Message the agent'
                    : armed && !touch
                      ? 'Add a message, or Enter again to send'
                      : 'Add a message'
              }
              aria-label="Message the agent"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={keyDown}
              onSelect={mentions.sync}
              onBlur={mentions.close}
              onPaste={(e) => {
                if (!e.clipboardData.files.length) return
                e.preventDefault() // a screenshot or a copied file: attached, not its file name typed
                attach(e.clipboardData.files)
              }}
              bare
              className={composerText}
            />
            {mentions.menu}
          </div>
          <AttachPickers
            any={picker}
            pictures={picturePicker}
            narrow={narrow}
            onPicked={(list) => {
              attach(list)
              setOpen(false) // added: the panel has done its part
            }}
          />
          {extra}
          <SendButton
            offered={offered}
            uploading={files.uploading > 0}
            waiting={waiting}
            narrow={narrow}
            disabled={offered ? accept.isPending : send.isPending || pictures.pending > 0 || (!message && !attached)}
          />
        </form>
      </div>
    </div>
  )
}

/** How long a passing error (a suggestion the screen no longer had) stays. */
const BANNER_MS = 6000

/** A composer banner's ×: it goes now (each also goes by itself when what it said passes). */
function Dismiss({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={onClick}>
      <X aria-hidden />
    </Button>
  )
}
