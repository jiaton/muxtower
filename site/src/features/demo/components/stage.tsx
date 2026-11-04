import { AnimatePresence } from 'motion/react'
import { useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { frameAt } from '../model/player'
import { useWidth } from '../hooks/use-width'
import { useTargetBox } from '../hooks/use-target-box'
import { Cursor } from './cursor'
import { DesktopWindow } from './desktop-window'
import { HubMap } from './hub-map'
import { MachineStrip } from './machine-strip'
import { Phone } from './phone'
import { Spotlight } from './spotlight'

/** The stage is drawn at one fixed size per layout and scaled to fit: what the cursor points at stays
 *  where the script expects it, at any width. */
const LAYOUTS = {
  wide: { width: 1200, height: 700 },
  tall: { width: 380, height: 800 },
} as const
/** Below this width the desktop window would be too small to read. */
const WIDE_FROM = 720
/** The frame is recomputed this often, not on every animation frame. */
const STEP_MS = 40
/** How often the cursor's and the spotlight's targets are measured again. */
const REMEASURE_MS = 200

export function Stage({ t, className }: { t: number; className?: string }) {
  const container = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const width = useWidth(container)
  const layout = width && width < WIDE_FROM ? 'tall' : 'wide'
  const size = LAYOUTS[layout]
  const scale = width ? width / size.width : 0
  const tick = Math.floor(t / STEP_MS)
  const frame = useMemo(() => frameAt(tick * STEP_MS), [tick])
  const { world } = frame
  const pressed = frame.clickAt !== null && frame.t - frame.clickAt < 280
  // Anything that moves what the cursor or the spotlight point at, and a few times a second besides:
  // a screen that animates in (the phone's) is in place only after its entrance.
  const revision = [
    Math.floor(t / REMEASURE_MS),
    layout,
    world.open,
    world.phone.screen,
    world.phone.session,
    world.phone.quote,
    world.phone.selection?.text,
    world.sessions.filter((s) => !s.hidden).length,
    Object.values(world.messages).reduce((n, list) => n + list.length, 0),
  ].join('|')
  const cursor = useTargetBox(stage, frame.cursor?.[layout] ?? null, scale, revision)
  const focus = useTargetBox(stage, frame.focus?.[layout] ?? null, scale, revision)

  return (
    <div
      ref={container}
      className={cn('relative w-full', !scale && 'invisible', className)}
      style={{ height: scale ? size.height * scale : size.height }}
    >
      <div
        ref={stage}
        className="absolute top-0 left-0 origin-top-left overflow-hidden"
        style={{ width: size.width, height: size.height, transform: `scale(${scale || 1})` }}
      >
        {layout === 'wide' ? (
          <>
            <DesktopWindow world={world} className="absolute top-0 left-0 h-[680px] w-[880px]" />
            <Phone world={world} className="absolute top-[60px] left-[905px] h-[630px] w-[295px]" />
          </>
        ) : (
          <>
            <MachineStrip world={world} className="absolute top-0 left-0 w-[380px]" />
            <Phone world={world} className="absolute top-[100px] left-[20px] h-[690px] w-[340px]" />
          </>
        )}
        <AnimatePresence>{world.map && <HubMap key="map" world={world} />}</AnimatePresence>
        <Spotlight box={focus} note={frame.focus?.note} />
        <Cursor box={cursor} pressed={pressed} />
      </div>
    </div>
  )
}
