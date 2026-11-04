import { ArrowUpRight } from 'lucide-react'
import { Section, SectionHeading } from '@/components/shared/section'
import { TermGrid } from '@/components/shared/term-grid'
import { Button } from '@/components/ui/button'
import { config } from '@/config'
import { securityList } from '@/content/lists'
import { security } from '@/content/page'

export function Security() {
  return (
    <Section id="security">
      <SectionHeading label={security.label} title={security.title} lead={security.lead} />
      <TermGrid items={securityList} />
      {config.securityUrl && (
        <Button asChild variant="link" className="mt-8 px-0">
          <a href={config.securityUrl}>
            The security model in full <ArrowUpRight />
          </a>
        </Button>
      )}
    </Section>
  )
}
