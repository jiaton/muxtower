import { GithubMark } from '@/components/shared/github-mark'
import { Button } from '@/components/ui/button'
import { config } from '@/config'
import { nav } from '@/content/page'

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <a href="#top" className="flex items-center gap-2 font-mono font-semibold" aria-label="muxtower, back to the top">
          <img src="/icon.svg" alt="" className="size-6" />
          muxtower
        </a>
        <nav aria-label="Sections" className="hidden gap-5 text-sm text-muted-foreground md:flex">
          {nav.map((item) => (
            <a key={item.href} href={item.href} className="hover:text-foreground">
              {item.label}
            </a>
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
