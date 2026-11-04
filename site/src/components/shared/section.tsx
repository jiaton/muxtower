import { cn } from '@/lib/utils'
import { RichText } from './rich-text'

/** A band of the page: an anchor, a centered measure, the page's vertical rhythm. */
export function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} data-reveal className={cn('mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-28', className)}>
      {children}
    </section>
  )
}

/** A section's title, with an optional numbered label and one sentence under it. */
export function SectionHeading({ label, title, lead }: { label?: string; title: string; lead?: string }) {
  return (
    <div className="mb-10 flex max-w-3xl flex-col gap-3">
      {label && <p className="font-mono text-sm text-primary">{label}</p>}
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {lead && (
        <p className="text-lg leading-relaxed text-muted-foreground">
          <RichText text={lead} />
        </p>
      )}
    </div>
  )
}
