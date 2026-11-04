import { Check, X } from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import type { Pending } from '../model/world'

/** What an agent asks to run, as the app shows it above the session: the tool, the exact command (from
 *  its hooks), and the options of its own dialog, the recommended one first in color. */
export function ApprovalCard({ pending, target }: { pending: Pending; target: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      data-demo={target}
      className="flex flex-col gap-1.5 border-b border-border bg-state-permission-soft p-3"
    >
      <p className="text-xs font-medium tracking-wide text-fg-muted uppercase">{pending.tool}</p>
      <p className="rounded-sm bg-background px-2 py-1 font-mono text-xs">{pending.command}</p>
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
