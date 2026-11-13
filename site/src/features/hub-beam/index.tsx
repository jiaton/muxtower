import { Cloud, Globe, HardDrive, Laptop, Monitor, Server, Smartphone, type LucideIcon } from 'lucide-react'
import { forwardRef, useRef } from 'react'
import { AnimatedBeam } from '@/components/ui/animated-beam'
import { cn } from '@/lib/utils'
import { beamNode, ink } from '@/components/ui/intents'

/** One machine or device in the drawing: an icon in a circle, its name under it. */
const Node = forwardRef<HTMLDivElement, { icon: LucideIcon; label: string; sub?: string; hub?: boolean }>(function Node(
  { icon: Icon, label, sub, hub },
  ref,
) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={ref}
        className={cn(beamNode({ hub: !!hub }), 'z-10 grid place-items-center', hub ? 'size-20 sm:size-24' : 'size-12 sm:size-14')}
      >
        <Icon className={hub ? `${ink.accent} size-8 sm:size-9` : `${ink.normal} size-5 sm:size-6`} aria-hidden />
      </div>
      <p className={`${ink.nodeLabel} text-center`}>
        {label}
        {sub && <span className={`${ink.quiet} block`}>{sub}</span>}
      </p>
    </div>
  )
})

const MACHINES = [
  { icon: Laptop, label: 'macbook' },
  { icon: Monitor, label: 'pc' },
  { icon: Server, label: 'server' },
  { icon: Cloud, label: 'vps' },
]

/** Machines dial out to the hub; the phone and the browser reach only the hub, over HTTPS. */
export function HubBeam({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const hub = useRef<HTMLDivElement>(null)
  const phone = useRef<HTMLDivElement>(null)
  const browser = useRef<HTMLDivElement>(null)
  const machines = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
  return (
    <div
      ref={box}
      role="img"
      aria-label="macbook, pc, server and vps dial out to the hub on the nas; the phone and the browser reach the hub over HTTPS"
      className={cn('relative flex items-center justify-between gap-4 py-4', className)}
    >
      <div className="flex flex-col gap-6 sm:gap-8">
        {MACHINES.map((m, i) => (
          <Node key={m.label} ref={machines[i]} icon={m.icon} label={m.label} />
        ))}
      </div>
      <Node ref={hub} icon={HardDrive} label="nas" sub="hub" hub />
      <div className="flex flex-col gap-16">
        <Node ref={phone} icon={Smartphone} label="phone" />
        <Node ref={browser} icon={Globe} label="browser" />
      </div>
      {machines.map((ref, i) => (
        <AnimatedBeam
          key={i}
          containerRef={box}
          fromRef={ref}
          toRef={hub}
          curvature={(1.5 - i) * 40}
          duration={4 + i * 0.6}
          delay={i * 0.4}
        />
      ))}
      <AnimatedBeam containerRef={box} fromRef={hub} toRef={phone} curvature={-30} duration={4} reverse />
      <AnimatedBeam containerRef={box} fromRef={hub} toRef={browser} curvature={30} duration={4.6} delay={0.8} reverse />
    </div>
  )
}
