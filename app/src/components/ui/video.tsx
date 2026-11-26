import { Play } from 'lucide-react'
import { cn } from '@/lib/cn'
import { box, text } from './styles'

/** A video's first frame: a media fragment a little past the start makes every browser (iOS Safari too,
 *  which draws nothing for `preload="metadata"` alone) decode and show a frame before it plays. */
const firstFrame = (src: string) => `${src}#t=0.1`

/** The round ▶ over a video's thumbnail that says it plays. `size`: on a small card (`sm`) or a large one. */
function PlayBadge({ size }: { size: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      data-play-badge
      className={cn(
        box({ radius: 'full', ground: 'inverse', shadow: 'sm' }),
        text({ tone: 'inverse' }),
        'pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center opacity-85',
        size === 'sm' ? 'size-6' : 'size-10',
      )}
    >
      <Play className={cn('fill-current', size === 'sm' ? 'ml-px size-3' : 'ml-0.5 size-5')} />
    </span>
  )
}

/**
 * A video shown small, still: its first frame (or a plain ground until it has one), with a ▶ over it so it
 * reads as a video. Never plays, takes no pointer and is hidden from screen readers: the button around it
 * names it and opens it in a `VideoPlayer`. The caller gives its size (`className`); the frame fills it
 * (`fit="cover"`, a small square) or shows whole, on a plain ground (`contain`, as a picture is).
 */
export function VideoThumb({
  src,
  size = 'md',
  fit = 'contain',
  className,
}: {
  src?: string
  size?: 'sm' | 'md'
  fit?: 'cover' | 'contain'
  className?: string
}) {
  return (
    <span data-video-thumb className={cn(box({ ground: 'muted', radius: 'sm' }), 'relative block overflow-hidden', className)}>
      {src ? (
        <video
          src={firstFrame(src)}
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
          aria-hidden
          className={cn('pointer-events-none block size-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
        />
      ) : null}
      <PlayBadge size={size} />
    </span>
  )
}

/**
 * A video shown large: the browser's own player (`controls`), inline on phones (`playsInline`), loading
 * only what it needs to show its first frame until played (`preload="metadata"`), never on its own.
 */
export function VideoPlayer({ src, label }: { src: string; label: string }) {
  return (
    <video src={firstFrame(src)} controls playsInline preload="metadata" aria-label={label} className="block max-h-[70dvh] max-w-full" />
  )
}
