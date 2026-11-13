import { X } from 'lucide-react'
import type { Attachment } from '../images'
import { box, motion, surface, text } from '@/components/ui/styles'
import { Spinner } from '@/components/ui/indicators'
import { Button } from '@/components/ui/button'

/** The pictures a message carries, above what is typed, each with its own remove; a placeholder for each
 *  still being made small. */
export function ImageCards({ items, pending = 0, onRemove }: { items: Attachment[]; pending?: number; onRemove: (id: string) => void }) {
  return (
    <ul aria-label="Pictures" className="flex gap-2 overflow-x-auto px-2 pt-2">
      {items.map((item, i) => (
        <li key={item.id} className="relative shrink-0">
          <img src={item.preview} alt={`Picture ${i + 1}`} className={`${surface.outlined} size-14 object-cover`} />
          <Button
            variant="plain"
            aria-label={`Remove picture ${i + 1}`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onRemove(item.id)}
            className={`${box({ radius: 'full', ground: 'inverse', shadow: 'sm' })} ${text({ tone: 'inverse' })} absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center`}
          >
            <X className="size-3" aria-hidden />
          </Button>
        </li>
      ))}
      {Array.from({ length: pending }, (_, i) => (
        <li key={`pending-${i}`} aria-label="Adding a picture" className="shrink-0">
          <div className={`${surface.muted} ${motion({ pulse: true })} flex size-14 items-center justify-center`}>
            <Spinner tone="muted" className="size-5" />
          </div>
        </li>
      ))}
    </ul>
  )
}
