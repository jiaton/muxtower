import { Check } from 'lucide-react'
import { Section, SectionHeading } from '@/components/shared/section'
import { team } from '@/content/page'
import { TeamExamples } from './team-examples'

export function Team() {
  return (
    <Section id="team" tone="muted">
      <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <SectionHeading eyebrow={team.eyebrow} title={team.title} lead={team.lead} />
          <ul className="flex flex-col gap-3">
            {team.facts.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <Check className="size-4 shrink-0 text-primary" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <TeamExamples />
      </div>
    </Section>
  )
}
