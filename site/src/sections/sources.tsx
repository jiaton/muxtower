import { Section, SectionHeading } from '@/components/shared/section'
import { TermGrid } from '@/components/shared/term-grid'
import { sourceList } from '@/content/lists'
import { sources } from '@/content/page'

export function Sources() {
  return (
    <Section id="sources">
      <SectionHeading label={sources.label} title={sources.title} lead={sources.lead} />
      <TermGrid items={sourceList} columns={2} />
    </Section>
  )
}
