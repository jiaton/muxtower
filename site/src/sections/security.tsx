import { ArrowRight } from 'lucide-react'
import { Section, SectionHeading } from '@/components/ui/section'
import { config } from '@/config'
import { security } from '@/content/features'

export function Security() {
  return (
    <div className="border-y border-border bg-surface-muted">
      <Section id="security">
        <SectionHeading eyebrow={security.eyebrow} title={security.title} lead={security.lead} />
        <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {security.points.map((point) => (
            <div key={point.title} className="flex flex-col gap-1.5 border-l-2 border-accent pl-4">
              <dt className="font-semibold">{point.title}</dt>
              <dd className="text-sm leading-relaxed text-fg-muted">{point.text}</dd>
            </div>
          ))}
        </dl>
        {config.securityUrl && (
          <a
            href={config.securityUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-10 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover [&_svg]:size-4"
          >
            {security.policy}
            <ArrowRight />
          </a>
        )}
      </Section>
    </div>
  )
}
