import { ArrowDown, ArrowRight, LockKeyhole, Server, Smartphone, SquareTerminal } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { Section, SectionHeading } from '@/components/ui/section'
import { cn } from '@/lib/cn'
import { how, stages } from '@/content/how'

const ICONS: Record<string, ReactNode> = {
  agents: <SquareTerminal />,
  daemon: <Server />,
  https: <LockKeyhole />,
  you: <Smartphone />,
}

/** The path from an agent to your phone, as boxes and arrows (across on a wide page, down on a phone). */
export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeading eyebrow={how.eyebrow} title={how.title} lead={how.lead} />
      <ol className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
        {stages.map((stage, i) => (
          <Fragment key={stage.id}>
            {i > 0 && (
              <li aria-hidden className="flex justify-center text-fg-muted [&_svg]:size-5">
                <ArrowDown className="lg:hidden" />
                <ArrowRight className="hidden lg:block" />
              </li>
            )}
            <li
              className={cn(
                'flex flex-1 flex-col gap-3 rounded-lg border bg-surface p-5',
                stage.id === 'daemon' ? 'border-accent shadow-card' : 'border-border',
              )}
            >
              <div className="flex items-center gap-2 font-semibold">
                <span aria-hidden className={cn('[&_svg]:size-5', stage.id === 'daemon' ? 'text-accent' : 'text-fg-muted')}>
                  {ICONS[stage.id]}
                </span>
                {stage.title}
              </div>
              <ul className="flex flex-col gap-1.5 text-sm text-fg-muted">
                {stage.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          </Fragment>
        ))}
      </ol>
      <p className="mt-8 max-w-3xl leading-relaxed text-fg-muted">{how.hub}</p>
    </Section>
  )
}
