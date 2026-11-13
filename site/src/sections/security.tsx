import { ArrowUpRight, Ban, CloudOff, DoorOpen, KeyRound, Ticket, type LucideIcon } from 'lucide-react'
import { Section, SectionHeading } from '@/components/ui/section'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { config } from '@/config'
import { securityList } from '@/content/lists'
import { security } from '@/content/page'
import { ink } from '@/components/ui/intents'

const ICONS: Record<(typeof securityList)[number]['icon'], LucideIcon> = {
  key: KeyRound,
  ticket: Ticket,
  ban: Ban,
  door: DoorOpen,
  'cloud-off': CloudOff,
}

export function Security() {
  return (
    <Section id="security">
      <SectionHeading eyebrow={security.eyebrow} title={security.title} lead={security.lead} align="center" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {securityList.map((item) => {
          const Icon = ICONS[item.icon]
          return (
            <Card soft key={item.title} className="gap-3 p-5">
              <Icon className={`${ink.accent} size-5`} aria-hidden />
              <h3 className={ink.strong}>{item.title}</h3>
              <p className={ink.copy}>{item.text}</p>
            </Card>
          )
        })}
      </div>
      {config.securityUrl && (
        <div className="mt-8 flex justify-center">
          <Button asChild variant="link">
            <a href={config.securityUrl}>
              The security model in full <ArrowUpRight />
            </a>
          </Button>
        </div>
      )}
    </Section>
  )
}
