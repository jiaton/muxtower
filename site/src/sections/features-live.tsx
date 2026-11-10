import { AudioLines, Ear, Mic, Pause, Play, Plus, SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { featureCells as c } from '@/content/features'
import { cn } from '@/lib/utils'

/** The app's message box in Live mode, played on a loop by CSS (`.live-*` in site.css): a sentence is
 *  heard and lands in the box (which glows), "send" sends it, "pause" turns Live to commands only. The
 *  status is one row of one height, as in the app; what changes in a spot is stacked in one grid cell and
 *  each `live-*` class shows its thing for its stretch. Frozen with the sentence in the box for reduced
 *  motion. */
export function LivePicture() {
  const l = c.live
  const stack = 'grid grid-cols-1 *:col-start-1 *:row-start-1'
  return (
    <div className="flex w-full max-w-xl flex-col gap-2 text-sm" aria-hidden>
      <p className="live-bubble ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-primary-foreground">{l.said}</p>
      <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-2 shadow-card-soft">
        <div className={stack}>
          <div className="live-writing flex h-10 items-center gap-2 px-2 text-muted-foreground">
            <span className="live-dot size-2.5 shrink-0 rounded-full bg-primary" />
            <AudioLines className="size-4 shrink-0 text-primary" />
            <span className="flex shrink-0 font-medium whitespace-nowrap text-primary">
              <span className="live-quiet overflow-hidden">{l.writing}</span>
              <span className="live-hearing overflow-hidden">{l.hearing}</span>
              <span className="live-pending overflow-hidden">{l.pending}</span>
            </span>
            <span className={cn(stack, 'min-w-0 flex-1')}>
              <span className="live-hint truncate text-xs">{l.hint}</span>
              <span className="live-sent truncate text-foreground">{l.sent}</span>
            </span>
            <Button variant="ghost" size="icon-sm" tabIndex={-1} className="shrink-0">
              <Pause />
            </Button>
          </div>
          <div className="live-commands flex h-10 items-center gap-2 rounded-md border border-border bg-muted px-2 text-muted-foreground">
            <Ear className="size-4 shrink-0" />
            <span className="shrink-0 font-medium text-foreground">{l.commandsOnly}</span>
            <span className={cn(stack, 'min-w-0 flex-1')}>
              <span className="live-resume-hint truncate text-xs">{l.resumeHint}</span>
              <span className="live-paused truncate text-foreground">{l.paused}</span>
            </span>
            <Button variant="secondary" size="sm" tabIndex={-1} className="shrink-0">
              <Play />
              <span className="max-sm:hidden">{l.resume}</span>
            </Button>
          </div>
        </div>
        <div className="flex items-end gap-1">
          <Button variant="ghost" size="icon" tabIndex={-1} className="max-sm:hidden">
            <Plus />
          </Button>
          <p className={cn(stack, 'live-glow min-h-9 min-w-0 flex-1 items-center rounded-md border border-input px-3 py-1.5')}>
            <span className="live-placeholder truncate text-muted-foreground">{l.placeholder}</span>
            <span className="live-said truncate">{l.said}</span>
          </p>
          <Button variant="secondary" size="icon" tabIndex={-1} className={cn(stack, 'place-items-center')}>
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
