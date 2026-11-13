import { Check, X } from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import type { Pending } from '../model/world'
import { ink as appInk } from '@app/components/ui/intents'
import { device } from '@/components/ui/intents'

/** What an agent asks to run, as the app shows it above the session: the tool, the exact command (from
 *  its hooks), and the options of its own dialog, the recommended one first in color. */
export function ApprovalCard({ pending, target }: { pending: Pending; target: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      data-demo={target}
      className={`${device.approval} flex flex-col gap-1.5 p-3`}
    >
      <p className={appInk.eyebrow}>{pending.tool}</p>
      <p className={`${device.command} px-2 py-1`}>{pending.command}</p>
      {pending.options.map((option, i) => (
        <Button
          key={option}
          size="sm"
          variant={i === pending.recommended ? 'success' : 'outline'}
          data-demo={`${target}-option-${i}`}
          tabIndex={-1}
          className="h-auto justify-start py-1.5 text-left whitespace-normal"
        >
          {i === pending.recommended && <Check />}
          {option}
        </Button>
      ))}
      <Button size="sm" variant="ghost" tabIndex={-1} className="self-start">
        <X /> Deny (Esc)
      </Button>
    </motion.div>
  )
}
