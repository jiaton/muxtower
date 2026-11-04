import { Section, SectionHeading } from '@/components/shared/section'
import { TermGrid } from '@/components/shared/term-grid'
import { reachList } from '@/content/lists'
import { reach } from '@/content/page'

export function Reach() {
  return (
    <Section id="reach">
      <SectionHeading label={reach.label} title={reach.title} />
      <TermGrid items={reachList} />
    </Section>
  )
}
