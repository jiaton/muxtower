import { FactList } from '@/components/shared/fact-list'
import { Section, SectionHeading } from '@/components/shared/section'
import { Terminal } from '@/components/shared/terminal'
import { joinTranscript } from '@/content/lists'
import { hub } from '@/content/page'

export function Hub() {
  return (
    <Section id="hub">
      <div className="grid items-start gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading label={hub.label} title={hub.title} lead={hub.lead} />
          <FactList facts={hub.facts} />
        </div>
        <Terminal title="join a machine to the hub" lines={joinTranscript} />
      </div>
    </Section>
  )
}
