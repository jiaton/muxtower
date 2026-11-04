import { Separator } from '@/components/ui/separator'
import { config } from '@/config'
import { footer } from '@/content/page'

export function Footer() {
  const links = [
    config.repoUrl && { href: config.repoUrl, label: 'GitHub' },
    config.readmeUrl && { href: config.readmeUrl, label: 'README' },
    config.securityUrl && { href: config.securityUrl, label: 'Security' },
    { href: config.pypiUrl, label: 'PyPI' },
  ].filter((l): l is { href: string; label: string } => Boolean(l))
  return (
    <footer className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
      <Separator className="mb-8" />
      <div className="flex flex-col gap-6 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-mono font-semibold text-foreground">muxtower</p>
          <p>{footer.tagline}</p>
          <p>
            {footer.status} {footer.license}.
          </p>
        </div>
        <nav aria-label="Elsewhere" className="flex gap-5">
          {links.map((l) => (
            <a key={l.label} href={l.href} className="hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
