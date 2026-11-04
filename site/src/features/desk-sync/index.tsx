import { ArrowLeftRight, Check, Laptop, Smartphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DESK } from './session'

/** One Claude desktop session seen twice: in the desktop app on the Mac, and in muxtower on the phone,
 *  where its permission request is answered. Drawn plainly (no Claude branding): what matters is that
 *  it is the same session, and the answer shows in both. */
export function DeskSync({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Pane icon={<Laptop className="size-4" />} where="Claude desktop app · macbook">
          <Conversation />
          <p className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-fg-muted">
            <Check className="size-3.5 text-success" /> {DESK.answered}
          </p>
        </Pane>
        <div className="flex flex-col items-center gap-1 text-center text-xs text-muted-foreground">
          <ArrowLeftRight className="size-5 text-primary" aria-hidden />
          <span>Remote Control,</span>
          <span>your Claude account</span>
        </div>
        <Pane icon={<Smartphone className="size-4" />} where="muxtower · your phone">
          <Conversation />
          <div className="flex flex-col gap-1.5 rounded-md bg-state-permission-soft p-2.5">
            <p className="font-mono text-xs">
              {DESK.tool}: {DESK.command}
            </p>
            <Button size="sm" variant="success" tabIndex={-1} className="justify-start">
              <Check /> {DESK.option}
            </Button>
          </div>
        </Pane>
      </div>
      <p className="text-center text-sm text-muted-foreground">{DESK.caption}</p>
    </div>
  )
}

function Pane({ icon, where, children }: { icon: React.ReactNode; where: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 [&_svg]:shrink-0">
          {icon} {where}
        </span>
        <Badge variant="outline">{DESK.name}</Badge>
      </figcaption>
      {children}
    </figure>
  )
}

function Conversation() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="self-end rounded-lg bg-primary px-3 py-1.5 text-primary-foreground">{DESK.asked}</p>
      <p className="leading-relaxed">{DESK.reply}</p>
    </div>
  )
}
