import { useState } from 'react'
import type { Attachment } from '../images'
import { Button } from '@/components/ui/button'
import { ImageViewer } from '@/components/ui/image-viewer'
import { Spinner } from '@/components/ui/indicators'

import { look } from '@/components/ui/intents'
import { RemoveBadge } from '@/components/ui/remove-badge'
import { keepFocus } from '@/components/ui/gesture'

/** The pictures a message carries, above what is typed, each with its own remove; a placeholder for each
 *  still being made small. A tap on one shows it large, the others a swipe or an arrow key away. */
export function ImageCards({ items, pending = 0, onRemove }: { items: Attachment[]; pending?: number; onRemove: (id: string) => void }) {
  const [shown, setShown] = useState<number | null>(null)
  return (
    <ul aria-label="Pictures" className="flex gap-2 overflow-x-auto px-2 pt-2">
      {items.map((item, i) => (
        <li key={item.id} className="relative shrink-0">
          <Button variant="plain" aria-label={`Show picture ${i + 1}`} onPointerDown={keepFocus} onClick={() => setShown(i)}>
            <img src={item.preview} alt={`Picture ${i + 1}`} className={`${look.frame} size-14 object-cover`} />
          </Button>
          <RemoveBadge
            aria-label={`Remove picture ${i + 1}`}
            onPointerDown={keepFocus}
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
      <ImageViewer
        count={items.length}
        index={shown === null ? null : Math.min(shown, items.length - 1)}
        onIndexChange={setShown}
        onClose={() => setShown(null)}
        title={(i) => `Picture ${i + 1}`}
        slide={(i) => <img src={items[i]?.preview} alt={`Picture ${i + 1}`} draggable={false} />}
      />
    </ul>
  )
}
