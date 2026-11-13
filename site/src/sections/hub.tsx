import { Globe2, PlugZap, Unplug } from 'lucide-react'
import { Section, SectionHeading } from '@/components/ui/section'
import { Card } from '@/components/ui/card'
import { hub } from '@/content/page'
import { HubBeam } from '@/features/hub-beam'
import { ink, look } from '@/components/ui/intents'

const ICONS = [Unplug, Globe2, PlugZap]

export function Hub() {
  return (
    <Section id="hub">
      <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <SectionHeading eyebrow={hub.eyebrow} title={hub.title} lead={hub.lead} />
          <dl className="flex flex-col gap-6">
            {hub.facts.map((f, i) => {
              const Icon = ICONS[i]
              return (
                <div key={f.title} className="flex gap-4">
                  <span className={`${look.iconTile} grid size-9 shrink-0 place-items-center`}>
                    <Icon className={`${ink.accent} size-4`} aria-hidden />
                  </span>
                  <div>
                    <dt className={ink.strong}>{f.title}</dt>
                    <dd className={ink.quiet}>{f.text}</dd>
                  </div>
                </div>
              )
            })}
          </dl>
        </div>
        <Card soft className="px-6 py-8 sm:px-10">
          <HubBeam />
        </Card>
      </div>
    </Section>
  )
}
