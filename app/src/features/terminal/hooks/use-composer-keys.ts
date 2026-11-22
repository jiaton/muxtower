import { useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import { useComposerHistory } from '@/lib/composer-history'
import { matches } from '@/lib/shortcuts'
import { useDrafts } from '../store'

const NONE: string[] = []

/**
 * The message box's editing keys, apart from sending (`lib/shortcuts.ts` has them all):
 * - Ctrl+U clears the box (a Mac's Control too), undoable with ⌘Z / Ctrl+Z: the browser's own delete over
 *   the whole text, so its undo has it; where the browser will not, the text is kept here for one undo.
 * - ↑ in an empty box shows the last message sent from this session's box (on this browser), ↑ again an
 *   older one, ↓ a newer one and, past the newest, the empty box again; the caret at the end. While the box
 *   holds a message shown that way, unchanged, ↑ and ↓ walk; edited, they move the caret as always (sent,
 *   it is a new message; the one it came from stays). Esc on one unchanged empties the box; emptying it
 *   any way ends the walk.
 * `onKeyDown` says whether it took the key. `recordSend` keeps what is typed as sent (the box's Enter or
 * Send; not a suggestion taken, nor Live's spoken send).
 */
export function useComposerKeys(
  textarea: RefObject<HTMLTextAreaElement | null>,
  draftKey: string,
  draft: string,
  setText: (text: string) => void,
) {
  const sent = useComposerHistory((s) => s.sent[draftKey]) ?? NONE
  const record = useComposerHistory((s) => s.record)
  /** The message shown from the history: its place in it, and its text as shown. */
  const walk = useRef<{ at: number; shown: string } | null>(null)
  /** What Ctrl+U took, when the browser could not take it undoably itself. */
  const cleared = useRef<string | null>(null)
  const caretToEnd = useRef(false)

  useLayoutEffect(() => {
    if (!caretToEnd.current) return
    caretToEnd.current = false
    const el = textarea.current
    el?.setSelectionRange(el.value.length, el.value.length)
  }, [draft, textarea])

  const show = (text: string) => {
    caretToEnd.current = true
    setText(text)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (e.defaultPrevented || e.nativeEvent.isComposing) return false
    const ev = e.nativeEvent
    const walking = walk.current !== null && walk.current.shown === draft
    if (matches('clear', ev)) {
      e.preventDefault()
      walk.current = null
      if (!draft) return true
      const el = e.currentTarget
      el.select()
      // The browser's own edit, on its undo stack (and an input event, which sets the draft).
      const done = typeof document.execCommand === 'function' && document.execCommand('delete')
      if (done && el.value === '') cleared.current = null
      else {
        cleared.current = draft
        setText('')
      }
      return true
    }
    if (matches('undo', ev) && cleared.current !== null && !draft) {
      e.preventDefault()
      show(cleared.current)
      cleared.current = null
      return true
    }
    if (matches('older', ev)) {
      if (walking) {
        e.preventDefault()
        const at = Math.max(0, walk.current!.at - 1)
        walk.current = { at, shown: sent[at]! }
        show(sent[at]!)
        return true
      }
      if (draft || !sent.length) return false
      e.preventDefault()
      const at = sent.length - 1
      walk.current = { at, shown: sent[at]! }
      show(sent[at]!)
      return true
    }
    if (matches('newer', ev) && walking) {
      e.preventDefault()
      const at = walk.current!.at + 1
      if (at >= sent.length) {
        walk.current = null
        show('')
      } else {
        walk.current = { at, shown: sent[at]! }
        show(sent[at]!)
      }
      return true
    }
    if (matches('leaveHistory', ev) && walking) {
      e.preventDefault()
      walk.current = null
      show('')
      return true
    }
    return false
  }

  /** What the box holds now (from the store: Live may have just written it), kept as sent. */
  const recordSend = () => {
    walk.current = null
    cleared.current = null
    record(draftKey, useDrafts.getState().drafts[draftKey] ?? '')
  }

  return { onKeyDown, recordSend }
}
