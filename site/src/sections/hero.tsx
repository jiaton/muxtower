import { ArrowUpRight } from 'lucide-react'
import { CommandPill } from '@/components/shared/command-pill'
import { Button } from '@/components/ui/button'
import { demoUrl } from '@/config'
import { hero } from '@/content/page'
import { DemoShow } from '@/features/demo'

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
          <div className="flex flex-wrap items-center gap-3">
            <CommandPill command={hero.install} />
            <Button asChild variant="outline">
              <a href={demoUrl} target="_blank" rel="noreferrer">
                {hero.tryApp}
                <ArrowUpRight />
              </a>
            </Button>
            <span className="text-sm text-muted-foreground">{hero.tryAppNote}</span>
          </div>
        </div>
        <DemoShow />
      </div>
    </section>
  )
}
