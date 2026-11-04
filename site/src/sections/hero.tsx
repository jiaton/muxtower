import { ArrowUpRight, MousePointerClick } from 'lucide-react'
import { CommandPill } from '@/components/shared/command-pill'
import { Button } from '@/components/ui/button'
import { config, demoUrl } from '@/config'
import { hero } from '@/content/page'
import { DemoShow } from '@/features/demo'

/** The way into the live demo (the real app on a simulated daemon), the page's main call to action. */
function TryApp() {
  return (
    <Button asChild size="xl">
      <a href={demoUrl} target="_blank" rel="noreferrer">
        <MousePointerClick />
        {hero.tryApp}
        <ArrowUpRight />
      </a>
    </Button>
  )
}

/** The hosted app, for your own daemon; left out when the build names none. */
function OpenApp() {
  if (!config.appUrl) return null
  return (
    <Button asChild size="xl" variant="outline">
      <a href={config.appUrl} target="_blank" rel="noreferrer">
        {hero.openApp}
        <ArrowUpRight />
      </a>
    </Button>
  )
}

/** The first screen: what muxtower is in one sentence, how to install it, and the demo playing. */
export function Hero() {
  return (
    <section id="demo" className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-glow blur-3xl" />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-5 pt-12 pb-16 sm:px-8 lg:pt-16">
        <div className="flex max-w-3xl flex-col gap-6">
          <p className="font-mono text-sm text-primary">{hero.eyebrow}</p>
          <h1 className="text-hero font-semibold text-balance">{hero.title}</h1>
          <p className="text-lg leading-relaxed text-muted-foreground sm:text-xl">{hero.lead}</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <TryApp />
              <OpenApp />
            </div>
            <p className="text-sm text-muted-foreground">
              {hero.tryAppNote}
              {config.appUrl && ` ${hero.openAppNote}`}
            </p>
            <div className="flex">
              <CommandPill command={hero.install} />
            </div>
          </div>
        </div>
        <DemoShow />
        <div className="flex flex-col items-start gap-4 rounded-xl border border-primary bg-state-busy-soft p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg leading-snug text-balance">{hero.afterDemo}</p>
          <TryApp />
        </div>
      </div>
    </section>
  )
}
