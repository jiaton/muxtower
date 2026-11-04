import { ArrowDown, Bell, Bot, Check, Code2, Laptop, Quote, RefreshCw, Smartphone } from 'lucide-react'
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
