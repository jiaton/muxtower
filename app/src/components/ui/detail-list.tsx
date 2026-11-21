import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { CopyButton } from './copy-button'

/** A plain list of facts, a label and its value on each line (a session's details): labels in a quiet
 *  column of their own, values wrapping wherever they must (a long path breaks, nothing hidden), every
 *  line alike. */
export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 text-sm">{children}</dl>
}

/** One line of a `DetailList`. `code`: the value is machine text (a path, an id). `copy`: a button after it
 *  copies this text, named by `copyLabel` ("Copy the folder"). */
export function DetailItem({
  label,
  children,
  code = false,
  copy,
  copyLabel,
}: {
  label: string
  children: ReactNode
  code?: boolean
  copy?: string | null
  copyLabel?: string
}) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <span className={cn('min-w-0 break-words', code && 'font-mono text-xs break-all')}>{children}</span>
        {copy ? <CopyButton text={copy} label={copyLabel ?? `Copy ${label.toLowerCase()}`} /> : null}
      </dd>
    </>
  )
}
