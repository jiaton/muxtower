import type { Attachment } from '../images'
import { Spinner } from '@/components/ui/indicators'

import { look } from '@/components/ui/intents'
import { RemoveBadge } from '@/components/ui/remove-badge'

/** The pictures a message carries, above what is typed, each with its own remove; a placeholder for each
 *  still being made small. */
export function ImageCards({ items, pending = 0, onRemove }: { items: Attachment[]; pending?: number; onRemove: (id: string) => void }) {
  return (
    <ul aria-label="Pictures" className="flex gap-2 overflow-x-auto px-2 pt-2">
      {items.map((item, i) => (
        <li key={item.id} className="relative shrink-0">
          <img src={item.preview} alt={`Picture ${i + 1}`} className={`${look.frame} size-14 object-cover`} />
          <RemoveBadge
            aria-label={`Remove picture ${i + 1}`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onRemove(item.id)}
            className="absolute -top-1.5 -right-1.5"
          />
        </li>
      ))}
      {Array.from({ length: pending }, (_, i) => (
        <li key={`pending-${i}`} aria-label="Adding a picture" className="shrink-0">
          <div className={`${look.loadingTile} flex size-14 items-center justify-center`}>
            <Spinner tone="muted" className="size-5" />
          </div>
        </li>
      ))}
    </ul>
  )
}
