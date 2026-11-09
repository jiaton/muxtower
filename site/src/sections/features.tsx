import {
  ArrowDown,
  AudioLines,
  Bell,
  Bot,
  Check,
  Code2,
  Ear,
  Laptop,
  Mic,
  Pause,
  Play,
  Plus,
  Quote,
  RefreshCw,
  SendHorizontal,
  Smartphone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Section, SectionHeading } from '@/components/shared/section'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { featureCells as c } from '@/content/features'
import { features } from '@/content/page'
import { cn } from '@/lib/utils'

/** One cell of the bento: a picture on top, a title and one line under it. */
function Cell({
  icon: Icon,
  title,
  text,
  className,
  children,
}: {
  icon: typeof Bell
  title: string
  text: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn('gap-0 overflow-hidden p-0 shadow-card-soft', className)}>
      <div className="flex min-h-48 flex-1 items-center justify-center border-b border-border bg-background p-6">{children}</div>
      <div className="flex flex-col gap-1.5 p-6">
        <h3 className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 text-primary" aria-hidden />
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </Card>
  )
}

function Reach() {
  const n = c.reach.notification
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex gap-3 rounded-xl border border-border bg-card p-3 shadow-card-soft">
        <img src="/icon.svg" alt="" className="mt-0.5 size-8 rounded-md" />
        <div className="min-w-0 text-sm">
          <p className="flex justify-between gap-2">
            <span className="font-semibold">{n.title}</span>
            <span className="text-xs text-muted-foreground">now</span>
          </p>
          <p>{n.body}</p>
          <p className="text-muted-foreground">{n.where}</p>
        </div>
      </div>
      <div className="ml-auto flex max-w-xs flex-col gap-1.5 rounded-xl bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
        <p className="flex items-center gap-1.5 border-l-2 border-primary-foreground/50 pl-2 text-xs opacity-80">
          <Quote className="size-3" aria-hidden />
          {c.reach.quote}
        </p>
        <p>{c.reach.reply}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {c.reach.chips.map((chip) => (
          <Badge key={chip} variant="outline" className="font-normal">
            {chip}
          </Badge>
        ))}
      </div>
    </div>
  )
}

function Assistant() {
  return (
    <div className="flex w-full flex-col gap-2 text-sm">
      <p className="ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-primary-foreground">{c.assistant.ask}</p>
      <p className="max-w-[85%] rounded-xl bg-muted px-3 py-2">{c.assistant.answer}</p>
    </div>
  )
}

function Desk() {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-1.5">
        {c.desk.apps.map((app) => (
          <Badge key={app} variant="secondary" className="gap-1.5 font-normal">
            <Laptop className="size-3" aria-hidden />
            {app}
          </Badge>
        ))}
      </div>
      <ArrowDown className="size-4 text-muted-foreground" aria-hidden />
      <Badge className="gap-1.5">
        <Smartphone className="size-3" aria-hidden />
        One list on your phone
      </Badge>
    </div>
  )
}

function Updates() {
  return (
    <div className="flex w-full flex-col gap-2 font-mono text-xs">
      <p className="flex items-center justify-between rounded-lg border border-primary/40 bg-card px-3 py-2">
        <span className="font-semibold">nas · hub</span>
        <span className="text-primary">{c.updates.version}</span>
      </p>
      {c.updates.machines.map((m) => (
        <p key={m} className="flex items-center justify-between px-3">
          <span>{m}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Check className="size-3 text-success" aria-hidden /> {c.updates.version}
          </span>
        </p>
      ))}
    </div>
  )
}

/** The app's message box in Live mode, played on a loop by CSS (`.live-*` in site.css): a sentence is
 *  heard and lands in the box, "send" sends it, "pause" turns Live to commands only. Each `live-*` class is
 *  one thing's stretch of the loop; the states of one spot are stacked in one grid cell. Frozen with the
 *  sentence in the box for reduced motion. */
function Live() {
  const l = c.live
  const stack = 'grid *:col-start-1 *:row-start-1'
  return (
    <div className="flex w-full max-w-xl flex-col gap-2 text-sm" aria-hidden>
      <p className="live-bubble ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-primary-foreground">{l.said}</p>
      <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-2 shadow-card-soft">
        <p className={cn(stack, 'min-h-4 px-1 text-xs text-muted-foreground')}>
          <span className="live-added">{l.added}</span>
          <span className="live-sent">{l.sent}</span>
          <span className="live-paused">{l.paused}</span>
        </p>
        <div className={cn(stack, 'items-end')}>
          <div className="live-writing flex items-center gap-2 px-1">
            <span className="live-dot size-2.5 shrink-0 rounded-full bg-primary" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5 font-medium text-primary">
                <AudioLines className="size-4 shrink-0" />
                <span className={stack}>
                  <span className="live-quiet">{l.writing}</span>
                  <span className="live-hearing">{l.hearing}</span>
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {l.hint}
                <span className="live-transcribing">{l.transcribing}</span>
              </span>
            </span>
            <Button variant="ghost" size="icon-sm" tabIndex={-1}>
              <Pause />
            </Button>
          </div>
          <div className="live-commands flex flex-col gap-2 rounded-md border border-border bg-muted px-3 py-2">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Ear className="size-4 shrink-0" />
              <span>
                <span className="font-medium text-foreground">{l.commandsOnly}</span>
                {l.resumeHint}
              </span>
            </p>
            <Button variant="secondary" size="lg" tabIndex={-1} className="w-full">
              <Play /> {l.resume}
            </Button>
          </div>
        </div>
        <div className="flex items-end gap-1">
          <Button variant="ghost" size="icon" tabIndex={-1} className="max-sm:hidden">
            <Plus />
          </Button>
          <p className={cn(stack, 'min-h-9 min-w-0 flex-1 items-center rounded-md border border-input px-3 py-1.5')}>
            <span className="live-placeholder text-muted-foreground">{l.placeholder}</span>
            <span className="live-said">{l.said}</span>
          </p>
          <Button variant="secondary" size="icon" tabIndex={-1} className={stack}>
            <AudioLines className="live-writing text-primary" />
            <Ear className="live-commands text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" tabIndex={-1}>
            <Mic />
          </Button>
          <Button size="icon" tabIndex={-1}>
            <SendHorizontal />
          </Button>
        </div>
      </div>
    </div>
  )
}

function Api() {
  return (
    <pre className="w-full rounded-lg bg-terminal-bg p-4 font-mono text-xs leading-relaxed text-terminal-fg">
      {c.api.lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </pre>
  )
}

/** The rest of what muxtower does, one cell each. */
export function Features() {
  return (
    <Section id="features">
      <SectionHeading eyebrow={features.eyebrow} title={features.title} align="center" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Cell icon={Bell} title={c.reach.title} text={c.reach.text} className="md:col-span-2">
          <Reach />
        </Cell>
        <Cell icon={Bot} title={c.assistant.title} text={c.assistant.text}>
          <Assistant />
        </Cell>
        <Cell icon={AudioLines} title={c.live.title} text={c.live.text} className="md:col-span-2 lg:col-span-3">
          <Live />
        </Cell>
        <Cell icon={Laptop} title={c.desk.title} text={c.desk.text}>
          <Desk />
        </Cell>
        <Cell icon={RefreshCw} title={c.updates.title} text={c.updates.text}>
          <Updates />
        </Cell>
        <Cell icon={Code2} title={c.api.title} text={c.api.text}>
          <Api />
        </Cell>
      </div>
    </Section>
  )
}
