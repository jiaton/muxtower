import { Bot, ExternalLink, Laptop, MessagesSquare, ScanEye, ShieldCheck } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { PhoneFrame } from '@/components/ui/phone-frame'
import { RichText } from '@/components/ui/rich-text'
import { Section, SectionHeading } from '@/components/ui/section'
import { panelId, TabList, tabId } from '@/components/ui/tabs'
import { demoPage } from '@/config'
import { demo, type ScenarioId, scenarios } from '@/content/demo'

const ICONS: Record<ScenarioId, ReactNode> = {
  approve: <ShieldCheck />,
  answer: <MessagesSquare />,
  watch: <ScanEye />,
  machines: <Laptop />,
  desktop: <Bot />,
}

const GROUP = 'demo'

/** The real app, built against a simulated daemon (`app/src/demo/`), in a phone; each scenario opens the
 *  session it is about. */
export function Demo() {
  const [scenario, setScenario] = useState<ScenarioId>('approve')
  const current = scenarios.find((s) => s.id === scenario) ?? scenarios[0]
  const tabs = scenarios.map((s) => ({
    id: s.id,
    label: s.label,
    icon: ICONS[s.id],
  }))
  return (
    <Section id="demo" className="pt-8 lg:pt-12">
      <SectionHeading eyebrow={demo.eyebrow} title={demo.title} lead={demo.lead} />
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
        <div className="flex flex-col gap-6 lg:order-2">
          <div id={panelId(GROUP)} role="tabpanel" aria-labelledby={tabId(GROUP, scenario)}>
            <PhoneFrame className="lg:w-[24.5rem]">
              <iframe key={current.id} src={demoPage(current.session)} title={demo.frameTitle} className="size-full border-0" />
            </PhoneFrame>
          </div>
          <a
            href={demoPage(current.session)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 text-sm text-fg-muted hover:text-fg [&_svg]:size-4"
          >
            {demo.fullScreen}
            <ExternalLink />
          </a>
        </div>
        <div className="flex flex-col gap-4 lg:order-1 lg:pt-4">
          <TabList group={GROUP} label="Scenarios" tabs={tabs} value={scenario} onChange={setScenario} variant="cards" />
          <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm leading-relaxed text-fg-muted" aria-live="polite">
            <RichText text={current.description} />
          </p>
        </div>
      </div>
    </Section>
  )
}
