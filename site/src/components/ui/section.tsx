import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { RichText } from './rich-text'

const band = cva('w-full scroll-mt-16', {
  variants: {
    tone: {
      plain: '',
      muted: 'border-y border-border bg-card',
      ink: 'bg-ink text-ink-fg',
    },
  },
  defaultVariants: { tone: 'plain' },
})

/** A band of the page: an anchor, a centered measure, the page's vertical rhythm. `ink` is the page's one
 *  dark band. */
export function Section({
  id,
  tone,
  className,
  children,
}: { id?: string; className?: string; children: React.ReactNode } & VariantProps<typeof band>) {
  return (
    <section id={id} className={band({ tone })}>
      <div data-reveal className={cn('mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 lg:py-32', className)}>
        {children}
      </div>
    </section>
  )
}

const heading = cva('mb-14 flex flex-col gap-4', {
  variants: { align: { left: 'max-w-2xl', center: 'mx-auto max-w-2xl items-center text-center' } },
  defaultVariants: { align: 'left' },
})

/** A section's title: a short eyebrow, the claim, and one sentence under it. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  align,
  tone = 'plain',
}: { eyebrow?: string; title: string; lead?: string; tone?: 'plain' | 'ink' } & VariantProps<typeof heading>) {
  return (
    <div className={heading({ align })}>
      {eyebrow && (
        <p className={cn('font-mono text-xs font-medium tracking-widest uppercase', tone === 'ink' ? 'text-ink-accent' : 'text-primary')}>
          {eyebrow}
        </p>
      )}
      <h2 className="text-4xl font-semibold tracking-tighter text-balance sm:text-5xl">{title}</h2>
      {lead && (
        <p className={cn('text-lg leading-relaxed text-pretty', tone === 'ink' ? 'text-ink-muted' : 'text-muted-foreground')}>
          <RichText text={lead} />
        </p>
      )}
    </div>
  )
}
