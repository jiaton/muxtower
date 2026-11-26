import { File as FileIcon, FileX } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { box, text } from './styles'

/**
 * A file to fetch rather than look at (a PDF, a log, an archive): a file icon, its name cut in the middle
 * (`head` may end in an ellipsis, `tail` — the last letters and the extension — always shows), a detail
 * line under it (its size; why it failed, `tone="danger"`), and its action at the right (a Download
 * button). `gone`: the file is no more (expired): a crossed-out icon, faded, and no action. Not
 * `FileChip`: that is an attachment on its way out, with a remove and an upload's progress.
 */
export function FileCard({
  name,
  head,
  tail,
  detail,
  tone = 'muted',
  action,
  gone = false,
}: {
  name: string
  head: string
  tail: string
  detail: ReactNode
  tone?: 'muted' | 'danger'
  action?: ReactNode
  gone?: boolean
}) {
  const Icon = gone ? FileX : FileIcon
  return (
    <div
      role="group"
      aria-label={name}
      data-gone={gone || undefined}
      title={name}
      className={cn(
        box({ outline: 'default', radius: 'md', ground: 'surface', faded: gone ? 'dim' : undefined }),
        'flex w-96 max-w-full items-center gap-2 px-3 py-2',
      )}
    >
      <Icon className={cn(text({ tone: 'muted' }), 'size-5 shrink-0')} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn(text({ size: 'sm', weight: 'medium' }), 'flex min-w-0')}>
          {head ? <span className="min-w-0 truncate">{head}</span> : null}
          <span className="shrink-0 whitespace-pre">{tail}</span>
        </span>
        <span className={cn(text({ size: 'xs', tone, numeric: true }), 'truncate')}>{detail}</span>
      </div>
      {!gone && action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
