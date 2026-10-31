import { config } from '@/config'
import { footer } from '@/content/page'

export function Footer() {
  const links = [
    { href: config.pypiUrl, label: 'PyPI' },
    ...(config.repoUrl ? [{ href: config.repoUrl, label: 'GitHub' }] : []),
    ...(config.readmeUrl ? [{ href: config.readmeUrl, label: 'Documentation' }] : []),
  ]
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-fg-muted sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2 font-semibold text-fg">
            <img src="/icon.svg" alt="" width={20} height={20} className="size-5" />
            muxtower
          </span>
          <p>{footer.tagline}</p>
          <p>
            {footer.status} {footer.license}.
          </p>
        </div>
        <nav aria-label="Elsewhere" className="flex gap-5">
          {links.map((link) => (
            <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="hover:text-fg">
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
