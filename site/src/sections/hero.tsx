import { ArrowUpRight, MousePointerClick } from 'lucide-react'
import { CommandPill } from '@/components/ui/command-pill'
import { FeatureClip } from '@/components/ui/feature-clip'
import { Badge } from '@/components/ui/badge'
import { BorderBeam } from '@/components/ui/border-beam'
import { Button } from '@/components/ui/button'
import { DotPattern } from '@/components/ui/dot-pattern'
import { demoUrl } from '@/config'
import { hero } from '@/content/page'
import { DemoShow } from '@/features/demo'
import { ink, look } from '@/components/ui/intents'

/** The way into the live demo (the real app on a simulated daemon), the page's main call to action. */
export function TryApp() {
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

/** The first screen: what muxtower is in one sentence, the way in, and the demo playing. */
export function Hero() {
  return (
    <section id="demo" className="relative overflow-hidden">
      <DotPattern width={22} height={22} cr={1} fade="top" />
      <div aria-hidden className={`${look.glow} pointer-events-none absolute inset-x-0 -top-48 h-112`} />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-14 px-5 pt-20 pb-20 sm:px-8 lg:pt-28">
        <div className="flex max-w-4xl flex-col items-center gap-7 text-center">
          <Badge variant="eyebrow" className="gap-2">
            <span className={`${look.liveDot} size-1.5`} aria-hidden />
            {hero.eyebrow}
          </Badge>
          <h1 className={`${ink.hero} text-balance`}>
            {/* One sentence a line; the space stays for anything that reads the text. */}
            {hero.title.split(/(?<=\.) /).map((line, i) => (
              <span key={line} className="block">
                {i ? ' ' : ''}
                {line}
              </span>
            ))}
          </h1>
          <p className={`${ink.heroLead} max-w-2xl text-pretty`}>{hero.lead}</p>
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <TryApp />
              <CommandPill command={hero.install} large />
            </div>
            <p className={ink.note}>{hero.tryAppNote}</p>
          </div>
        </div>
        <div className={`${look.showcaseGlass} relative w-full p-3 sm:p-5`}>
          <DemoShow />
          <BorderBeam size={140} duration={9} />
        </div>
      </div>
    </section>
  )
}

/** Under the hero: the real app recorded, every session's state changing live. */
export function HeroClip() {
  return (
    <section aria-label={hero.clip} className="w-full">
      <figure data-reveal className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-5 pb-8 sm:px-8">
        <FeatureClip id="live-list" label={hero.clip} />
        <figcaption className={ink.note}>{hero.clipNote}</figcaption>
      </figure>
    </section>
  )
}
