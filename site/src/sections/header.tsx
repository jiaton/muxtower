import { ButtonLink } from '@/components/ui/button'
import { GithubMark } from '@/components/ui/icons'
import { config } from '@/config'
import { nav } from '@/content/page'

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="muxtower, back to the top">
          <img src="/icon.svg" alt="" width={28} height={28} className="size-7" />
          muxtower
        </a>
        <nav aria-label="Sections" className="hidden flex-1 items-center gap-1 md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ButtonLink href="#demo" variant="ghost" size="sm" className="md:hidden">
            Demo
          </ButtonLink>
          {config.repoUrl && (
            <ButtonLink href={config.repoUrl} variant="outline" size="sm" aria-label="muxtower on GitHub">
              <GithubMark />
              <span className="hidden sm:inline">GitHub</span>
            </ButtonLink>
          )}
        </div>
      </div>
    </header>
  )
}
