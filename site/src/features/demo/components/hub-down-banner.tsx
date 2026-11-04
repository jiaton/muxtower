import { Unplug } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { hubDownText } from '../model/world'

/** What the app says while the hub does not answer, in the warning banner it shows over the list. */
export function HubDownBanner({ target, className }: { target: string; className?: string }) {
  return (
    <motion.p
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      data-demo={target}
      className={cn('flex items-start gap-2 bg-state-permission-soft px-3 py-2 text-xs', className)}
    >
      <Unplug className="mt-0.5 size-3.5 shrink-0 text-state-permission" aria-hidden />
      <span>{hubDownText()}</span>
    </motion.p>
  )
}
