import { FactList } from '@/components/shared/fact-list'
import { Section, SectionHeading } from '@/components/shared/section'
import { Terminal } from '@/components/shared/terminal'
import { assistant, assistantTranscript } from '@/content/assistant'

export function Assistant() {
  return (
    <Section id="assistant">
      <div className="grid items-start gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading label={assistant.label} title={assistant.title} lead={assistant.lead} />
          <FactList facts={assistant.facts} />
        </div>
        <Terminal title="talking to the concierge" lines={assistantTranscript} />
      </div>
    </Section>
  )
}
