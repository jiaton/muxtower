import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** One band of the page, reachable by its `id` from the header. */
export function Section({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn('mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24', className)}>
      {children}
    </section>
  )
}

export function SectionHeading({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: ReactNode }) {
  return (
    <div className="mb-12 flex max-w-2xl flex-col gap-3">
      {eyebrow && <p className="text-xs font-semibold tracking-widest text-accent uppercase">{eyebrow}</p>}
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {lead && <p className="text-lg leading-relaxed text-pretty text-fg-muted">{lead}</p>}
    </div>
  )
}
