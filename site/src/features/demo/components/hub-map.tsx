import { Monitor, Server, ShieldCheck, Smartphone } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { DEVICES, type World } from '../model/world'
import { ink as appInk } from '@app/components/ui/intents'
import { device, ink, mapNode } from '@/components/ui/intents'

/** Where each machine sits on the map, in percent of the stage. */
const PLACE: Record<string, { x: number; y: number }> = {
  nas: { x: 50, y: 48 },
  server: { x: 18, y: 20 },
  vps: { x: 82, y: 20 },
  mac: { x: 18, y: 76 },
  pc: { x: 82, y: 76 },
}
const PHONE = { x: 50, y: 86 }

/** The demo's last beat: the machines around the hub, each dialing out to it, and the phone talking to
 *  the hub alone over HTTPS. */
export function HubMap({ world, className }: { world: World; className?: string }) {
  const hub = PLACE.nas
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={cn(device.mapScrim, 'absolute inset-0 z-20', className)}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
        {DEVICES.filter((d) => !d.hub).map((d, i) => (
          <motion.line
            key={d.id}
            x1={PLACE[d.id].x}
            y1={PLACE[d.id].y}
            x2={hub.x}
            y2={hub.y}
            className={device.lineOut}
            strokeWidth="0.35"
            strokeDasharray="1.2 1"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.3 + i * 0.25, duration: 0.6 }}
          />
        ))}
        <motion.line
          x1={PHONE.x}
          y1={PHONE.y}
          x2={hub.x}
          y2={hub.y}
          className={device.lineBack}
          strokeWidth="0.6"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 1.6, duration: 0.5 }}
        />
      </svg>
      {DEVICES.map((d, i) => {
        const agents = world.sessions.filter((s) => s.device === d.id && !s.hidden).length
        const all = world.sessions.filter((s) => !s.hidden).length
        return (
          <Node key={d.id} at={PLACE[d.id]} delay={d.hub ? 0 : 0.3 + i * 0.25} hub={d.hub}>
            {d.hub ? <Server className={`${appInk.accent} size-4`} /> : <Monitor className={`${appInk.quiet} size-4`} />}
            <span className="flex flex-col">
              <span className={appInk.strong}>
                {d.name}
                {d.hub && <span className={appInk.accent}> · hub</span>}
              </span>
              <span className={appInk.meta}>
                {d.hub ? `lists all ${all} agents` : `${agents} ${agents === 1 ? 'agent' : 'agents'} · dials out`}
              </span>
            </span>
          </Node>
        )
      })}
      <Node at={PHONE} delay={1.6}>
        <Smartphone className={`${appInk.success} size-4`} />
        <span className="flex flex-col">
          <span className={appInk.strong}>your phone</span>
          <span className={`${ink.successNote} flex items-center gap-1`}>
            <ShieldCheck className="size-3" /> HTTPS to the hub, a token of its own
          </span>
        </span>
      </Node>
    </motion.div>
  )
}

function Node({ at, delay, hub, children }: { at: { x: number; y: number }; delay: number; hub?: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.35 }}
      style={{ left: `${at.x}%`, top: `${at.y}%` }}
      className={`${mapNode({ hub: !!hub })} absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 px-3 py-2 whitespace-nowrap`}
    >
      {children}
    </motion.div>
  )
}
