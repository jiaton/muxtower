import { ChevronRight, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { text } from './styles'

type Tone = NonNullable<Parameters<typeof text>[0]>['tone']

/** Something on its way: a turning circle, in a tone. */
export function Spinner({ tone, className, label }: { tone?: Tone; className?: string; label?: string }) {
  return (
    <LoaderCircle
      className={cn('size-4 shrink-0 animate-spin', text({ tone }), className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  )
}

/** A fold's chevron: right when closed, down when open, turning between. */
export function Chevron({ open, className }: { open: boolean; className?: string }) {
  return <ChevronRight aria-hidden className={cn('shrink-0 transition-transform', open && 'rotate-90', className)} />
}

const DOT = {
  accent: 'bg-accent',
  danger: 'bg-danger',
  idle: 'bg-state-idle',
  warning: 'bg-state-permission',
  success: 'bg-success',
  muted: 'bg-fg-muted/50',
} as const

/** A small round mark in a tone, pulsing while something goes on. */
export function Dot({ tone, pulse = false, className }: { tone: keyof typeof DOT; pulse?: boolean; className?: string }) {
  return <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', DOT[tone], pulse && 'animate-pulse', className)} />
}
