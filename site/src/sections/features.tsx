import { ArrowDown, AudioLines, Bell, Bot, Check, Code2, Keyboard, Laptop, Quote, RefreshCw, Smartphone } from 'lucide-react'
import { FeatureClip } from '@/components/ui/feature-clip'
import { Section, SectionHeading } from '@/components/ui/section'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { featureCells as c } from '@/content/features'
import { features } from '@/content/page'
import { cn } from '@/lib/utils'
import { ink, look } from '@/components/ui/intents'

/** One cell of the bento: a picture on top, a title and one line under it. */
function Cell({
  icon: Icon,
  title,
  text,
  points,
  className,
  children,
}: {
  icon: typeof Bell
  title: string
  text: string
  /** What sets it apart, a few words each. */
  points?: readonly string[]
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card soft className={cn('gap-0 overflow-hidden p-0', className)}>
      <div className={`${look.previewStage} flex min-h-48 flex-1 items-center justify-center p-6`}>{children}</div>
      <div className="flex flex-col gap-1.5 p-6">
        <h3 className={`${ink.heading} flex items-center gap-2`}>
          <Icon className={`${ink.accent} size-4`} aria-hidden />
          {title}
        </h3>
        <p className={ink.copy}>{text}</p>
        {points ? (
          <ul className={`${ink.note} mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2`}>
            {points.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <span className={`${look.bullet} size-1.5 shrink-0`} aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  )
}

function Reach() {
  const n = c.reach.notification
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className={`${look.card} flex gap-3 p-3`}>
        <img src="/icon.svg" alt="" className={`${look.appIcon} mt-0.5 size-8`} />
        <div className={`${ink.body} min-w-0`}>
          <p className="flex justify-between gap-2">
            <span className={ink.heading}>{n.title}</span>
            <span className={ink.meta}>now</span>
          </p>
          <p>{n.body}</p>
          <p className={ink.quiet}>{n.where}</p>
        </div>
      </div>
      <div className={`${look.askBubble} ml-auto flex max-w-xs flex-col gap-1.5 px-3 py-2.5`}>
        <p className={`${look.bubbleQuote} flex items-center gap-1.5 pl-2`}>
          <Quote className="size-3" aria-hidden />
          {c.reach.quote}
        </p>
        <p>{c.reach.reply}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {c.reach.chips.map((chip) => (
          <Badge key={chip} variant="outline" text="plain">
            {chip}
          </Badge>
        ))}
      </div>
    </div>
  )
}

function Assistant() {
  return (
    <div className={`${ink.body} flex w-full flex-col gap-2`}>
      <p className={`${look.askBubble} ml-auto max-w-[85%] px-3 py-2`}>{c.assistant.ask}</p>
      <p className={`${look.answerBubble} max-w-[85%] px-3 py-2`}>{c.assistant.answer}</p>
    </div>
  )
}

function Desk() {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-1.5">
        {c.desk.apps.map((app) => (
          <Badge key={app} variant="secondary" text="plain" className="gap-1.5">
            <Laptop className="size-3" aria-hidden />
            {app}
          </Badge>
        ))}
      </div>
      <ArrowDown className={`${ink.quiet} size-4`} aria-hidden />
      <Badge className="gap-1.5">
        <Smartphone className="size-3" aria-hidden />
        One list on your phone
      </Badge>
    </div>
  )
}

function Updates() {
  return (
    <div className={`${ink.codeSmall} flex w-full flex-col gap-2`}>
      <p className={`${look.highlightCard} flex items-center justify-between px-3 py-2`}>
        <span className={ink.heading}>nas · hub</span>
        <span className={ink.accent}>{c.updates.version}</span>
      </p>
      {c.updates.machines.map((m) => (
        <p key={m} className="flex items-center justify-between px-3">
          <span>{m}</span>
          <span className={`${ink.quiet} flex items-center gap-1`}>
            <Check className={`${ink.success} size-3`} aria-hidden /> {c.updates.version}
          </span>
        </p>
      ))}
    </div>
  )
}

function Api() {
  return (
    <pre className={`${look.terminalBlock} w-full p-4`}>
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
        <Cell icon={AudioLines} title={c.live.title} text={c.live.text} points={c.live.points} className="md:col-span-2 lg:col-span-3">
          <FeatureClip id="live-voice" label={c.live.clip} className="max-w-4xl" />
        </Cell>
        <Cell icon={Keyboard} title={c.keys.title} text={c.keys.text} className="md:col-span-2">
          <FeatureClip id="keyboard-flow" label={c.keys.clip} />
        </Cell>
        <Cell icon={Laptop} title={c.desk.title} text={c.desk.text}>
          <Desk />
        </Cell>
        <Cell icon={RefreshCw} title={c.updates.title} text={c.updates.text}>
          <Updates />
        </Cell>
        <Cell icon={Code2} title={c.api.title} text={c.api.text} className="md:col-span-2">
          <Api />
        </Cell>
      </div>
    </Section>
  )
}
