import { useEffect, useRef, useState, type ComponentType, type RefObject } from 'react'
import { Button } from './button'

const SETTLE_MS = 200 // a selection still being dragged out is not ready to act on
const EDGE_PX = 64 // how near the screen's sides and bottom the button may come

/** A button by text selected inside `within` (e.g. Reply), once the selection rests: under it, since a
 *  phone draws its own menu (copy, look up) above it. It acts on the text as it was selected, and the
 *  selection goes. */
export function SelectionAction({
  within,
  label,
  icon: Icon,
  onAction,
}: {
  within: RefObject<HTMLElement | null>
  label: string
  icon: ComponentType<{ 'aria-hidden'?: boolean }>
  onAction: (text: string) => void
}) {
  const [at, setAt] = useState<{ x: number; y: number; text: string } | null>(null)
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

  if (!at) return null
  const left = Math.min(Math.max(at.x, EDGE_PX), window.innerWidth - EDGE_PX)
  const top = Math.min(at.y + 10, window.innerHeight - EDGE_PX)
  return (
    <div className="fixed z-50 -translate-x-1/2" style={{ left, top }}>
      <Button
        size="sm"
        className="shadow-card"
        onPointerDown={(e) => {
          acting.current = true
          e.preventDefault() // keep the selection (and the keyboard) as they are until it acts
        }}
        onClick={() => {
          onAction(at.text)
          document.getSelection()?.removeAllRanges()
          setAt(null)
        }}
      >
        <Icon aria-hidden />
        {label}
      </Button>
    </div>
  )
}
