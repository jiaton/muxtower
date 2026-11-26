import { File as FileIcon, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './button'
import { keepFocus } from './gesture'
import { RemoveBadge } from './remove-badge'
import { box, text } from './styles'

/**
 * A file attached to a message, beside its pictures and as tall as one: a file icon, its name cut in the
 * middle (`head` may end in an ellipsis, `tail` — the last letters and the extension — always shows), its
 * size, and a × on the corner. `uploading`: a bar along its foot fills with `progress` (0–1); `error`: why,
 * in the danger tone, and Retry where `onRetry` is given. `thumb` (a video's `VideoThumb`, in a button that
 * shows it) takes the file icon's place, unless it failed.
 */
export function FileChip({
  name,
  head,
  tail,
  size,
  status,
  progress = 0,
  error,
  onRetry,
  onRemove,
  thumb,
}: {
  name: string
  head: string
  tail: string
  size: string
  status: 'uploading' | 'ready' | 'error'
  progress?: number
  error?: string
  onRetry?: () => void
  onRemove: () => void
  thumb?: ReactNode
}) {
  const failed = status === 'error'
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100)
  return (
    <div
      role="group"
      aria-label={`${name}, ${failed ? error : status === 'uploading' ? `uploading, ${percent}%` : size}`}
      data-status={status}
      className="relative shrink-0"
    >
      <div
        title={name}
        className={cn(
          box({ outline: failed ? 'danger' : 'default', radius: 'md', ground: 'surface' }),
          'relative flex h-14 w-52 items-center gap-2 overflow-hidden px-2',
        )}
      >
        {failed ? (
          <TriangleAlert className={cn(text({ tone: 'danger' }), 'size-5 shrink-0')} aria-hidden />
        ) : thumb ? (
          <span className="size-10 shrink-0">{thumb}</span>
        ) : (
          <FileIcon className={cn(text({ tone: 'muted' }), 'size-5 shrink-0')} aria-hidden />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn(text({ size: 'sm', weight: 'medium' }), 'flex min-w-0')}>
            {head ? <span className="min-w-0 truncate">{head}</span> : null}
            <span className="shrink-0 whitespace-pre">{tail}</span>
          </span>
          {failed ? (
            <span className={cn(text({ size: 'xs', tone: 'danger' }), 'flex min-w-0 items-baseline gap-1')}>
              <span className="min-w-0 truncate" title={error}>
                {error}
              </span>
              {onRetry ? (
                <>
                  <span aria-hidden>·</span>
                  <Button variant="link" size="xs" tone="danger" className="h-auto px-0" onPointerDown={keepFocus} onClick={onRetry}>
                    Retry
                  </Button>
                </>
              ) : null}
            </span>
          ) : (
            <span className={cn(text({ size: 'xs', tone: 'muted', numeric: true }), 'truncate')}>
              {status === 'uploading' ? `${size} · ${percent}%` : size}
            </span>
          )}
        </div>
        {status === 'uploading' ? (
          <div
            role="progressbar"
            aria-label={`Uploading ${name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className={cn(box({ ground: 'muted' }), 'absolute inset-x-0 bottom-0 h-1')}
          >
            <div className={cn(box({ ground: 'accent' }), 'h-full transition-[width]')} style={{ width: `${percent}%` }} />
          </div>
        ) : null}
      </div>
      <RemoveBadge aria-label={`Remove ${name}`} onPointerDown={keepFocus} onClick={onRemove} className="absolute -top-1.5 -right-1.5" />
    </div>
  )
}
