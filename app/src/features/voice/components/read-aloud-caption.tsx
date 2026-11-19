import { useTapOrSwipe } from '@/components/ui/press'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
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
  // A tap keeps it (or lets it go), a swipe sideways or down puts it away; the × is its own button.
  const gesture = useTapOrSwipe(SWIPE_PX, { tap: () => keepCaption(!useSpeech.getState().captionKept), swipe: dismissCaption })
  useEffect(() => {
    body.current?.querySelector('[data-now]')?.scrollIntoView?.({ block: 'nearest' })
  }, [shown?.at])
  if (!shown) return null
  return (
    <div
      role="status"
      aria-label="Being read aloud"
      aria-live="off"
      className={cn(card, 'absolute inset-x-2 bottom-full z-20 mb-2 flex touch-pan-y flex-col gap-1 p-3 select-none')}
      {...gesture}
    >
      <div className="flex items-center gap-2">
        <span className={cn(ink.eyebrow, 'min-w-0 flex-1 truncate')}>{shown.title || 'Read aloud'}</span>
        {shown.kind === 'reply' && shown.pieces.length > 1 ? (
          <span className={cn(ink.meta, ink.count)}>
            {shown.at + 1}/{shown.pieces.length}
          </span>
        ) : null}
        {kept ? <span className={ink.meta}>kept</span> : null}
        <Button variant="ghost" size="icon-xs" aria-label="Put the caption away" onClick={dismissCaption}>
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
