import { Pause, Play, RotateCcw } from 'lucide-react'
import { RichText } from '@/components/ui/rich-text'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { Player } from '../hooks/use-player'
import { beatIndexAt } from '../model/player'
import { BEATS, DURATION } from '../model/script'
import { ink } from '@/components/ui/intents'

/** What the demo is showing now, in one sentence, and the beats to jump between. */
export function Controls({ player, className }: { player: Player; className?: string }) {
  const index = beatIndexAt(player.t)
  const beat = BEATS[index]
  const end = BEATS[index + 1]?.start ?? DURATION
  const progress = Math.min(1, (player.t - beat.start) / (end - beat.start))
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={player.playing ? 'Pause the demo' : 'Play the demo'}
          onClick={player.playing ? player.pause : player.play}
        >
          {player.playing ? <Pause /> : <Play />}
        </Button>
        <ol className="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="Demo steps">
          {BEATS.map((b, i) => (
            <li key={b.id} className="min-w-20 flex-1">
              <Button variant="step" size="step" aria-current={i === index ? 'step' : undefined} onClick={() => player.seek(b.start)}>
                <Progress aria-hidden className="h-1" value={i < index ? 100 : i === index ? progress * 100 : 0} />
                <span className="truncate">{b.title}</span>
              </Button>
            </li>
          ))}
        </ol>
        <Button variant="ghost" size="icon" aria-label="Start the demo again" onClick={() => player.seek(0)}>
          <RotateCcw />
        </Button>
      </div>
      <p className={`${ink.caption} min-h-14 text-balance max-md:order-first`} aria-live="polite">
        <RichText text={beat.caption} />
      </p>
    </div>
  )
}
