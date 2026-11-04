import { Section, SectionHeading } from '@/components/shared/section'
import { TermGrid } from '@/components/shared/term-grid'
import { Terminal } from '@/components/shared/terminal'
import { api, apiIdeas, apiTranscript } from '@/content/api'

export function ApiClients() {
  return (
    <Section id="api">
      <SectionHeading label={api.label} title={api.title} lead={api.lead} />
      <div className="grid items-start gap-12 lg:grid-cols-2">
        <Terminal title="a client of your own" lines={apiTranscript} />
        <div className="flex flex-col gap-6">
          <TermGrid items={apiIdeas} columns={2} />
          <p className="text-sm text-muted-foreground">{api.note}</p>
        </div>
      </div>
    </Section>
  )
}
