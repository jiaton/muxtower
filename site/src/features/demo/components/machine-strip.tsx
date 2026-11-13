import { Monitor, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sessionsOn } from '../model/lists'
import { DEVICES, type World } from '../model/world'
import { StateMark } from './marks'
import { ink as appInk } from '@app/components/ui/intents'
import { ink, machineTile } from '@/components/ui/intents'

/** On a narrow screen the desktop window does not fit: the machines and their agents' states, in a row
 *  above the phone, stand in for it. */
export function MachineStrip({ world, className }: { world: World; className?: string }) {
  return (
    <div data-demo="strip" className={cn('grid grid-cols-5 gap-1.5', className)}>
      {DEVICES.map((d) => (
        <div
          key={d.id}
          data-demo={`strip-${d.id}`}
          className={`${machineTile({ hub: !!d.hub, flash: world.flash === 'devices', off: !!d.hub && world.hubDown })} flex flex-col items-center gap-1 px-1 py-2`}
        >
          {d.hub ? <Server className={`${appInk.quiet} size-4`} /> : <Monitor className={`${appInk.quiet} size-4`} />}
          <span className={ink.nodeName}>{d.name}</span>
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
