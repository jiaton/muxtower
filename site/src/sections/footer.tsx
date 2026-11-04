import { CommandPill } from '@/components/shared/command-pill'
import { DotPattern } from '@/components/ui/dot-pattern'
import { Separator } from '@/components/ui/separator'
import { config } from '@/config'
import { footer, hero } from '@/content/page'
import { TryApp } from './hero'

/** The last call to action, then where else muxtower lives. */
export function Footer() {
  const links = [
    config.repoUrl && { href: config.repoUrl, label: 'GitHub' },
    config.readmeUrl && { href: config.readmeUrl, label: 'README' },
    config.securityUrl && { href: config.securityUrl, label: 'Security' },
    config.appUrl && { href: config.appUrl, label: 'Hosted app' },
    { href: config.pypiUrl, label: 'PyPI' },
  ].filter((l): l is { href: string; label: string } => Boolean(l))
  return (
    <footer className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
      <div
        data-reveal
        className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-16 text-center shadow-card-soft sm:py-20"
      >
        <DotPattern width={22} height={22} cr={1} className="mask-radial-from-0% mask-radial-to-80% opacity-70" />
        <div className="relative flex flex-col items-center gap-7">
          <h2 className="max-w-2xl text-4xl font-semibold tracking-tighter text-balance sm:text-5xl">{footer.cta}</h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <TryApp />
            <CommandPill command={hero.install} className="h-12 text-base" />
          </div>
        </div>
      </div>
      <Separator className="my-10" />
      <div className="flex flex-col gap-6 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 font-mono font-semibold text-foreground">
            <img src="/icon.svg" alt="" className="size-5" />
            muxtower
          </p>
          <p>{footer.tagline}</p>
          <p>
            {footer.status} {footer.license}.
          </p>
        </div>
        <nav aria-label="Elsewhere" className="flex flex-wrap gap-5">
          {links.map((l) => (
            <a key={l.label} href={l.href} className="transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
