import { ListTodo, Wrench } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import type { Message } from '../model/world'

const enter = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }

interface Props {
  message: Message
  /** `data-demo` id the cursor aims at. */
  target?: string
  /** Part of an agent's reply drawn as selected. */
  selected?: string
}

/** One item of a conversation: your prompt (a quote first, as Markdown sends it), the agent's reply, a
 *  tool call with its output, or a task a teammate sent. */
export function MessageItem({ message, target, selected }: Props) {
  if (message.kind === 'you')
    return (
      <motion.div
        {...enter}
        data-demo={target}
        className="ml-8 flex flex-col gap-1 self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
      >
        {message.quote && <p className="border-l-2 border-primary-foreground/60 pl-2 opacity-85">{message.quote}</p>}
        <p>{message.text}</p>
      </motion.div>
    )
  if (message.kind === 'agent') {
    const at = selected ? message.text.indexOf(selected) : -1
    return (
      <motion.p {...enter} data-demo={target} className="mr-4 text-sm leading-relaxed">
        {at < 0 ? (
          message.text
        ) : (
          <>
            {message.text.slice(0, at)}
            <mark className="rounded-sm bg-state-busy-soft text-fg">{selected}</mark>
            {message.text.slice(at + (selected?.length ?? 0))}
          </>
        )}
      </motion.p>
    )
  }
  const task = message.kind === 'task'
  const Icon = task ? ListTodo : Wrench
  return (
    <motion.div
      {...enter}
      data-demo={target}
      className={cn(
        'flex flex-col gap-1 rounded-md border px-3 py-2',
        task ? 'border-accent bg-state-busy-soft' : 'border-border bg-muted',
      )}
    >
      <p className="flex items-start gap-2 font-mono text-xs">
        <Icon className="mt-0.5 size-3.5 shrink-0 text-fg-muted" />
        <span className="min-w-0 flex-1 break-words">
          {message.tool && <span className="font-semibold">{message.tool} </span>}
          {message.text}
        </span>
      </p>
      {message.output?.map((line) => (
        <p key={line} className="pl-5.5 font-mono text-xs break-words text-fg-muted">
          {line}
        </p>
      ))}
    </motion.div>
  )
}
