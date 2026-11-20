import type { ReactNode } from 'react'
import { FileChip } from '@/components/ui/file-chip'
import { formatSize, splitName } from '../files'
import type { FileItem } from '../hooks/use-files'

/** The row above what is typed: the message's pictures, then its files; it scrolls sideways when they do
 *  not fit. */
export function AttachmentRow({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto px-2 pt-2">{children}</div>
}

/** The files a message carries, each a chip: uploading (its progress), ready, or failed (why, and Retry when
 *  it never got an answer), each with its own remove. */
export function FileCards({ items, onRetry, onRemove }: { items: FileItem[]; onRetry: (key: string) => void; onRemove: (key: string) => void }) {
  return (
    <ul aria-label="Files" className="flex shrink-0 gap-2">
      {items.map((item) => (
        <li key={item.key} className="shrink-0">
          <FileChip
            name={item.file.name}
            {...splitName(item.file.name)}
            size={formatSize(item.file.size)}
            status={item.status}
            progress={item.file.size ? item.sent / item.file.size : 0}
            error={item.error}
            onRetry={item.retry ? () => onRetry(item.key) : undefined}
            onRemove={() => onRemove(item.key)}
          />
        </li>
      ))}
    </ul>
  )
}
