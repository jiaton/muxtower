import { AudioLines, Ear, Mic, Pause, Play, Plus, SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { featureCells as c } from '@/content/features'
import { cn } from '@/lib/utils'

/** The app's message box in Live mode, played on a loop by CSS (`.live-*` in site.css): a sentence is
 *  heard and lands in the box, "send" sends it, "pause" turns Live to commands only. Each `live-*` class is
 *  one thing's stretch of the loop; the states of one spot are stacked in one grid cell. Frozen with the
 *  sentence in the box for reduced motion. */
export function LivePicture() {
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
        {/* Only the state on show takes room: each one's row folds to nothing while the other shows. */}
        <div>
          <div className="live-rows-writing grid">
            <div className="min-h-0 overflow-hidden">
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
            </div>
          </div>
          <div className="live-rows-commands grid">
            <div className="min-h-0 overflow-hidden">
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
