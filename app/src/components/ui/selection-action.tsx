import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType, type PointerEvent, type RefObject } from 'react'
import { Button } from './button'

const SETTLE_MS = 120 // a selection still being dragged out is not ready to act on
const EDGE_PX = 96 // how near the screen's sides and bottom the buttons may come
const COPIED_MS = 900 // how long "Copied" shows before the buttons go

/** One more thing to do with selected text, after the main one (e.g. "Add to dictionary"). */
export interface MoreAction {
  label: string
  icon: ComponentType<{ 'aria-hidden'?: boolean }>
  onAction: (text: string) => void
}

/** Copy, and a button of its own (e.g. Reply), by text selected inside `within` once the selection rests:
 *  under it, since a phone draws its own menu (copy among many, look up) above it. They act on the text
 *  as it was selected, and the selection goes. `more`: a further action, shown only when given. */
export function SelectionAction({
  within,
  label,
  icon: Icon,
  onAction,
  more,
}: {
  within: RefObject<HTMLElement | null>
  label: string
  icon: ComponentType<{ 'aria-hidden'?: boolean }>
  onAction: (text: string) => void
  more?: MoreAction | null
}) {
  const [at, setAt] = useState<{ x: number; y: number; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const acting = useRef(false) // the button pressed: what the press does to the selection does not count

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let pressing = false
    const settle = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (acting.current) return
        const selection = document.getSelection()
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null
        const root = within.current
        const text = selection?.toString() ?? ''
        if (pressing || !range || !root || !text.trim() || !root.contains(range.commonAncestorContainer)) return setAt(null)
        const rect = range.getBoundingClientRect?.() ?? root.getBoundingClientRect()
        setAt({ x: rect.left + rect.width / 2, y: rect.bottom, text })
      }, SETTLE_MS)
    }
    const down = () => {
      if (!acting.current) pressing = true // a mouse dragging out a selection: wait for it to let go
    }
    const up = () => {
      pressing = acting.current = false
      settle()
    }
    document.addEventListener('selectionchange', settle)
    document.addEventListener('pointerdown', down)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    document.addEventListener('scroll', settle, true) // the selection moved with what scrolled
    return () => {
      clearTimeout(timer)
      document.removeEventListener('selectionchange', settle)
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      document.removeEventListener('scroll', settle, true)
    }
  }, [within])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => {
      document.getSelection()?.removeAllRanges()
      setAt(null)
      setCopied(false)
    }, COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  if (!at) return null
  const left = Math.min(Math.max(at.x, EDGE_PX), window.innerWidth - EDGE_PX)
  const top = Math.min(at.y + 10, window.innerHeight - EDGE_PX)
  const press = (e: PointerEvent) => {
    if (e.button !== 0) return // another mouse button (back, forward) is the browser's
    acting.current = true
    e.preventDefault() // keep the selection (and the keyboard) as they are until it acts
  }
  return (
    <div className="fixed z-50 flex -translate-x-1/2 gap-2" style={{ left, top }}>
      <Button
        size="sm"
        variant="secondary"
        className="shadow-card"
        onPointerDown={press}
        onClick={() => {
          copyText(at.text)
          setCopied(true)
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <Button
        size="sm"
        className="shadow-card"
        onPointerDown={press}
        onClick={() => {
          // The selection let go first: cleared after, it would take the caret from where acting put it
          // (the message box, focused to reply), as some browsers do.
          document.getSelection()?.removeAllRanges()
          onAction(at.text)
          setAt(null)
        }}
      >
        <Icon aria-hidden />
        {label}
      </Button>
      {more ? (
        <Button
          size="sm"
          variant="secondary"
          className="shadow-card"
          onPointerDown={press}
          onClick={() => {
            const text = at.text
            document.getSelection()?.removeAllRanges()
            more.onAction(text)
            setAt(null)
          }}
        >
          <more.icon aria-hidden />
          {more.label}
        </Button>
      ) : null}
    </div>
  )
}

/** The clipboard where the page may write it; else the old way, which copies what is selected (the
 *  buttons keep the selection). */
function copyText(text: string) {
  const fallback = () => void document.execCommand?.('copy')
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(fallback)
  else fallback()
}
