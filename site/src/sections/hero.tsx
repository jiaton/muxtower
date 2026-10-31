import { ArrowDown } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { Command } from '@/components/ui/code'
import { GithubMark } from '@/components/ui/icons'
import { config } from '@/config'
import { agents, hero } from '@/content/page'

export function Hero() {
  return (
    <div id="top" className="relative overflow-hidden">
      {/* A faint accent glow behind the headline. */}
      <div aria-hidden className="absolute inset-x-0 -top-40 mx-auto h-96 max-w-3xl rounded-full bg-accent/15 blur-3xl" />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-8 px-4 pt-20 pb-12 text-center sm:px-6 lg:pt-28">
        <p className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-fg-muted">{hero.eyebrow}</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">{hero.title}</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-pretty text-fg-muted">{hero.lead}</p>
        <div className="flex w-full max-w-xl flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Command command={hero.install} className="flex-1" />
          <ButtonLink href="#demo" size="lg">
            {hero.demo}
            <ArrowDown />
          </ButtonLink>
        </div>
        {config.repoUrl && (
          <ButtonLink href={config.repoUrl} variant="ghost" size="sm">
            <GithubMark />
            {hero.source}
          </ButtonLink>
        )}
        <ul aria-label="Works with" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          <li className="text-fg-muted">Works with</li>
          {agents.map((agent) => (
            <li key={agent.name} className="flex items-baseline gap-1.5">
              <span className="font-medium">{agent.name}</span>
              <span className="text-xs text-fg-muted">{agent.note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
