import { FactList } from '@/components/shared/fact-list'
import { Section, SectionHeading } from '@/components/shared/section'
import { Terminal } from '@/components/shared/terminal'
import { updates, updatesTranscript } from '@/content/updates'

export function Updates() {
  return (
    <Section id="updates">
      <div className="grid items-start gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading label={updates.label} title={updates.title} lead={updates.lead} />
          <FactList facts={updates.facts} />
        </div>
        <Terminal title="updating every machine" lines={updatesTranscript} />
      </div>
    </Section>
  )
}
