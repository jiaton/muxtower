import { LoaderCircle, X } from 'lucide-react'
import type { Attachment } from '../images'

/** The pictures a message carries, above what is typed, each with its own remove; a placeholder for each
 *  still being made small. */
export function ImageCards({ items, pending = 0, onRemove }: { items: Attachment[]; pending?: number; onRemove: (id: string) => void }) {
  return (
    <ul aria-label="Pictures" className="flex gap-2 overflow-x-auto px-2 pt-2">
      {items.map((item, i) => (
        <li key={item.id} className="relative shrink-0">
          <img src={item.preview} alt={`Picture ${i + 1}`} className="size-14 rounded-md border border-border object-cover" />
          <button
            type="button"
            aria-label={`Remove picture ${i + 1}`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onRemove(item.id)}
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-fg text-bg shadow-sm"
          >
            <X className="size-3" aria-hidden />
          </button>
        </li>
      ))}
      {Array.from({ length: pending }, (_, i) => (
        <li key={`pending-${i}`} aria-label="Adding a picture" className="shrink-0">
          <div className="flex size-14 animate-pulse items-center justify-center rounded-md border border-border bg-surface-muted">
            <LoaderCircle className="size-5 animate-spin text-fg-muted" aria-hidden />
          </div>
        </li>
      ))}
    </ul>
  )
}
