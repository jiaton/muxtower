import { FactList } from '@/components/shared/fact-list'
import { Section, SectionHeading } from '@/components/shared/section'
import { TermGrid } from '@/components/shared/term-grid'
import { sourceList } from '@/content/lists'
import { sources } from '@/content/page'
import { DeskSync } from '@/features/desk-sync'

export function Sources() {
  return (
    <Section id="sources">
      <SectionHeading label={sources.label} title={sources.title} lead={sources.lead} />
      <div className="flex flex-col gap-10">
        <DeskSync className="mx-auto w-full max-w-4xl" />
        <div className="grid gap-x-12 gap-y-4 lg:grid-cols-2">
          <FactList facts={sources.facts.slice(0, 2)} />
          <FactList facts={sources.facts.slice(2)} />
        </div>
        <p className="text-sm text-muted-foreground">{sources.caveat}</p>
      </div>
      <div className="mt-16">
        <TermGrid items={sourceList} columns={2} />
      </div>
    </Section>
  )
}
