import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { FileChip } from '@/components/ui/file-chip'
import { keepFocus } from '@/components/ui/gesture'
import { ImageViewer } from '@/components/ui/image-viewer'
import { VideoPlayer, VideoThumb } from '@/components/ui/video'
import { mediaKind } from '@/lib/media'
import { useObjectUrl } from '@/lib/use-object-url'
import { formatSize, splitName } from '../files'
import type { FileItem } from '../hooks/use-files'

/** The row above what is typed: the message's pictures, then its files; it scrolls sideways when they do
 *  not fit. */
export function AttachmentRow({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto px-2 pt-2">{children}</div>
}

const isVideo = (file: File) => mediaKind(file.name, file.type || null) === 'video'

/** The files a message carries, each a chip: uploading (its progress), ready, or failed (why, and Retry when
 *  it never got an answer), each with its own remove. A video shows its first frame, from the file on this
 *  device; a tap plays it large, the message's other videos a swipe or an arrow key away. */
export function FileCards({
  items,
  onRetry,
  onRemove,
}: {
  items: FileItem[]
  onRetry: (key: string) => void
  onRemove: (key: string) => void
}) {
  const videos = items.filter((item) => isVideo(item.file))
  const [shown, setShown] = useState<number | null>(null)
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
            thumb={isVideo(item.file) ? <LocalVideoThumb file={item.file} onOpen={() => setShown(videos.indexOf(item))} /> : undefined}
          />
        </li>
      ))}
      <ImageViewer
        count={videos.length}
        index={shown === null ? null : Math.min(shown, videos.length - 1)}
        onIndexChange={setShown}
        onClose={() => setShown(null)}
        title={(i) => videos[i]?.file.name ?? ''}
        slide={(i) => (videos[i] ? <LocalVideo key={videos[i].key} file={videos[i].file} /> : null)}
      />
    </ul>
  )
}

function LocalVideoThumb({ file, onOpen }: { file: File; onOpen: () => void }) {
  const url = useObjectUrl(file)
  return (
    <Button variant="plain" aria-label={`Play ${file.name}`} onPointerDown={keepFocus} onClick={onOpen} className="size-full">
      <VideoThumb src={url} size="sm" fit="cover" className="size-full" />
    </Button>
  )
}

function LocalVideo({ file }: { file: File }) {
  const url = useObjectUrl(file)
  return url ? <VideoPlayer src={url} label={file.name} /> : null
}
