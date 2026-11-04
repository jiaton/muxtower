import { FactList } from '@/components/shared/fact-list'
import { Section, SectionHeading } from '@/components/shared/section'
import { Terminal } from '@/components/shared/terminal'
import { teamTranscript } from '@/content/lists'
import { team } from '@/content/page'

export function Team() {
  return (
    <Section id="team">
      <div className="grid items-start gap-12 lg:grid-cols-2">
        <Terminal title="muxtower MCP tools · my_team, send_task" lines={teamTranscript} className="lg:order-1" />
        <div className="lg:order-2">
          <SectionHeading label={team.label} title={team.title} lead={team.lead} />
          <FactList facts={team.facts} />
        </div>
      </div>
    </Section>
  )
}
