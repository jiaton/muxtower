import { Unplug } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { hubDownText } from '../model/world'
import { ink as appInk } from '@app/components/ui/intents'
import { device } from '@/components/ui/intents'

/** What the app says while the hub does not answer, in the warning banner it shows over the list. */
export function HubDownBanner({ target, ruled }: { target: string; ruled?: boolean }) {
  return (
    <motion.p
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      data-demo={target}
      className={cn(ruled ? device.noticeRuled : device.notice, 'flex items-start gap-2 px-3 py-2')}
    >
      <Unplug className={`${appInk.warning} mt-0.5 size-3.5 shrink-0`} aria-hidden />
      <span>{hubDownText()}</span>
    </motion.p>
  )
}
