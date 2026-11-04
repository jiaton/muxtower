import { ListTodo, Quote, Wrench } from 'lucide-react'
import { motion } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Message } from '../model/world'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  delivered: 'default',
  queued: 'secondary',
}

/** One item of a conversation: your prompt (with the message it replies to), the agent's reply, a tool
 *  call or a task handed to a teammate. */
export function MessageItem({ message, target, flash }: { message: Message; target?: string; flash?: boolean }) {
  const enter = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }
  if (message.kind === 'you')
    return (
      <motion.div {...enter} className="ml-8 self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        {message.quote && (
          <p className="mb-1 flex gap-1 border-l-2 border-primary-foreground/50 pl-2 text-xs opacity-80">
            <Quote className="mt-0.5 size-3 shrink-0" />
            <span className="line-clamp-2">{message.quote}</span>
          </p>
        )}
        {message.text}
      </motion.div>
    )
  if (message.kind === 'agent')
    return (
      <motion.p
        {...enter}
        data-demo={target}
        className={cn('mr-6 rounded-lg px-1 py-1 text-sm transition-colors duration-500', flash && 'bg-state-busy-soft')}
      >
        {message.text}
      </motion.p>
    )
  const task = message.kind === 'task'
  const Icon = task ? ListTodo : Wrench
  return (
    <motion.div {...enter} className="flex flex-col gap-1.5 rounded-md border border-border bg-muted px-3 py-2">
      <p className="flex items-start gap-2 font-mono text-xs">
        <Icon className="mt-0.5 size-3.5 shrink-0 text-fg-muted" />
        <span className="min-w-0 flex-1 break-words">{message.text}</span>
      </p>
      {message.status && (
        <Badge variant={STATUS_VARIANT[message.status] ?? 'outline'} className="font-mono">
          {message.status}
        </Badge>
      )}
    </motion.div>
  )
}
