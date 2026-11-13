import { GithubMark } from '@/components/ui/github-mark'
import { Button } from '@/components/ui/button'
import { config } from '@/config'
import { nav } from '@/content/page'
import { ink, look } from '@/components/ui/intents'
import { TextLink } from '@/components/ui/text-link'

export function Header() {
  return (
    <header className={`${look.headerBar} sticky top-0 z-40`}>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-5 sm:px-8">
        <TextLink look="brand" href="#top" className="flex items-center gap-2" aria-label="muxtower, back to the top">
          <img src="/icon.svg" alt="" className="size-6" />
          muxtower
        </TextLink>
        <nav aria-label="Sections" className={`${ink.note} hidden gap-6 md:flex`}>
          {nav.map((item) => (
            <TextLink look="nav" key={item.href} href={item.href}>
              {item.label}
            </TextLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {config.repoUrl && (
            <Button asChild variant="ghost" size="sm">
              <a href={config.repoUrl} aria-label="muxtower on GitHub">
                <GithubMark />
                <span className="hidden sm:inline">GitHub</span>
              </a>
            </Button>
          )}
          <Button asChild size="sm">
            <a href="#install">Install</a>
          </Button>
        </div>
      </div>
    </header>
  )
}
