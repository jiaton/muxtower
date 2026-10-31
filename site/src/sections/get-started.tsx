import { useState, type ReactNode } from 'react'
import { Command, Snippet } from '@/components/ui/code'
import { RichText } from '@/components/ui/rich-text'
import { Section, SectionHeading } from '@/components/ui/section'
import { panelId, TabList, tabId } from '@/components/ui/tabs'
import { domain, https, install, pair, type RouteId, routes, start, tailscale } from '@/content/start'

function Step({ n, title, lead, children }: { n: number; title: string; lead: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-x-4">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-full border border-border bg-surface font-mono text-sm font-semibold sm:size-10"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-4 pt-0.5 sm:pt-1.5">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="leading-relaxed text-fg-muted">{lead}</p>
        </div>
        {children}
      </div>
    </li>
  )
}

const GROUP = 'https'

export function GetStarted() {
  const [route, setRoute] = useState<RouteId>('tailscale')
  const current = routes.find((r) => r.id === route) ?? routes[0]
  return (
    <Section id="get-started">
      <SectionHeading eyebrow={start.eyebrow} title={start.title} lead={start.lead} />
      <ol className="flex max-w-3xl flex-col gap-12">
        <Step n={1} title={install.title} lead={install.lead}>
          <div className="flex flex-col gap-2">
            {install.commands.map((command) => (
              <Command key={command} command={command} />
            ))}
          </div>
        </Step>
        <Step n={2} title={https.title} lead={https.lead}>
          <TabList group={GROUP} label="How to reach it" tabs={routes} value={route} onChange={setRoute} className="self-start" />
          <div id={panelId(GROUP)} role="tabpanel" aria-labelledby={tabId(GROUP, route)} className="flex flex-col gap-4">
            <p className="leading-relaxed text-fg-muted">{current.lead}</p>
            {route === 'tailscale' ? (
              <>
                <Command command={tailscale.command} />
                <p className="text-sm leading-relaxed text-fg-muted">{tailscale.note}</p>
              </>
            ) : (
              <>
                <Snippet caption="Caddyfile" code={domain.caddy} />
                <Snippet caption="config.toml" code={domain.config} />
                <p className="text-sm leading-relaxed text-fg-muted">{domain.others}</p>
                <p className="rounded-lg border border-accent/40 bg-accent/5 p-4 text-sm leading-relaxed">{domain.signIn}</p>
              </>
            )}
          </div>
        </Step>
        <Step n={3} title={pair.title} lead={pair.lead}>
          <Command command={pair.command} />
        </Step>
      </ol>
      <p className="mt-12 max-w-3xl text-sm leading-relaxed text-fg-muted">
        <RichText text={start.autostart} />
      </p>
    </Section>
  )
}
