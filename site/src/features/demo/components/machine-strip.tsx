import { Monitor, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sessionsOn } from '../model/lists'
import { DEVICES, type World } from '../model/world'
import { StateMark } from './marks'

/** On a narrow screen the desktop window does not fit: the machines and their agents' states, in a row
 *  above the phone, stand in for it. */
export function MachineStrip({ world, className }: { world: World; className?: string }) {
  return (
    <div data-demo="strip" className={cn('grid grid-cols-5 gap-1.5', className)}>
      {DEVICES.map((d) => (
        <div
          key={d.id}
          data-demo={`strip-${d.id}`}
          className={cn(
            'flex flex-col items-center gap-1 rounded-lg border bg-card px-1 py-2 transition-colors duration-700',
            d.hub ? 'border-accent' : 'border-border',
            world.flash === 'devices' && 'bg-state-busy-soft',
          )}
        >
          {d.hub ? <Server className="size-4 text-fg-muted" /> : <Monitor className="size-4 text-fg-muted" />}
          <span className="text-xs font-medium">{d.name}</span>
          <span className="flex gap-0.5">
            {sessionsOn(world, d.id).map((s) => (
              <StateMark key={s.id} state={s.state} className="size-3" />
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}
