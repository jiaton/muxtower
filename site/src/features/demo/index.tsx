import { useRef } from 'react'
import { Controls } from './components/controls'
import { Stage } from './components/stage'
import { usePlayer } from './hooks/use-player'

/** The demo: half a minute of muxtower at work, played by a cursor, with a sentence for each beat. It
 *  starts when it comes on screen (not for visitors who asked for less motion) and can be paused,
 *  replayed or jumped through. */
export function DemoShow() {
  const root = useRef<HTMLDivElement>(null)
  const player = usePlayer(root)
  return (
    <div ref={root} className="flex flex-col gap-6" role="region" aria-label="muxtower demo">
      <Stage t={player.t} />
      <Controls player={player} className="max-md:order-first" />
    </div>
  )
}
