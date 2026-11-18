import { X } from 'lucide-react'
import { useEffect, useRef, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import { caption as card, captionText, ink } from '@/components/ui/intents'
import { cn } from '@/lib/cn'
import { dismissCaption, keepCaption, useSpeech } from '../live/speech'

const SWIPE_PX = 60

/**
 * What Read aloud is saying, floating above Live's bar (out of the page's flow: nothing moves): the
 * session's name, the text in large type with the piece being said marked, and "2/7" while a reply is read
 * whole. It stays a few seconds after; a tap keeps it, × or a swipe puts it away.
 */
export function ReadAloudCaption() {
  const shown = useSpeech((s) => s.caption)
  const kept = useSpeech((s) => s.captionKept)
  const body = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    body.current?.querySelector('[data-now]')?.scrollIntoView?.({ block: 'nearest' })
  }, [shown?.at])
  if (!shown) return null
  const down = (e: PointerEvent) => (start.current = { x: e.clientX, y: e.clientY })
  const up = (e: PointerEvent) => {
    const from = start.current
    start.current = null
    if (!from) return
    const dx = e.clientX - from.x
    const dy = e.clientY - from.y
    if (Math.abs(dx) > SWIPE_PX || dy > SWIPE_PX) dismissCaption()
    else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) keepCaption(!kept)
  }
  return (
    <div
      role="status"
      aria-label="Being read aloud"
      aria-live="off"
      className={cn(card, 'absolute inset-x-2 bottom-full z-20 mb-2 flex touch-pan-y flex-col gap-1 p-3 select-none')}
      onPointerDown={down}
      onPointerUp={up}
    >
      <div className="flex items-center gap-2">
        <span className={cn(ink.eyebrow, 'min-w-0 flex-1 truncate')}>{shown.title || 'Read aloud'}</span>
        {shown.kind === 'reply' && shown.pieces.length > 1 ? (
          <span className={cn(ink.meta, ink.count)}>
            {shown.at + 1}/{shown.pieces.length}
          </span>
        ) : null}
        {kept ? <span className={ink.meta}>kept</span> : null}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Put the caption away"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={dismissCaption}
        >
          <X />
        </Button>
      </div>
      <div ref={body} className={captionText}>
        {shown.kind === 'reply' ? (
          // A reply read whole: the piece being said (the rest of it would not fit at a glance).
          <p data-now className={ink.normal}>
            {shown.pieces[shown.at]}
          </p>
        ) : (
          <p>
            {shown.pieces.map((piece, i) => (
              <span
                key={i}
                data-now={i === shown.at && !shown.done ? '' : undefined}
                className={i === shown.at && !shown.done ? ink.highlight : ink.normal}
              >
                {piece}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  )
}
