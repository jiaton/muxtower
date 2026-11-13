import { ListTodo, Wrench } from 'lucide-react'
import { motion } from 'motion/react'
import type { Message } from '../model/world'
import { bubble, ink as appInk } from '@app/components/ui/intents'
import { device, toolRow } from '@/components/ui/intents'

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
        className={`${bubble({ state: 'prompt' })} ${appInk.body} ml-8 flex flex-col gap-1 self-end`}
      >
        {message.quote && <p className={`${device.sentQuote} pl-2`}>{message.quote}</p>}
        <p>{message.text}</p>
      </motion.div>
    )
  if (message.kind === 'agent') {
    const at = selected ? message.text.indexOf(selected) : -1
    return (
      <motion.p {...enter} data-demo={target} className={`${device.reply} mr-4`}>
        {at < 0 ? (
          message.text
        ) : (
          <>
            {message.text.slice(0, at)}
            <mark className={device.picked}>{selected}</mark>
            {message.text.slice(at + (selected?.length ?? 0))}
          </>
        )}
      </motion.p>
    )
  }
  const task = message.kind === 'task'
  const Icon = task ? ListTodo : Wrench
  return (
    <motion.div {...enter} data-demo={target} className={`${toolRow({ task })} flex flex-col gap-1 px-3 py-2`}>
      <p className={`${appInk.codeSmall} flex items-start gap-2`}>
        <Icon className={`${appInk.quiet} mt-0.5 size-3.5 shrink-0`} />
        <span className="min-w-0 flex-1 break-words">
          {message.tool && <span className={appInk.emphasis}>{message.tool} </span>}
          {message.text}
        </span>
      </p>
      {message.output?.length ? (
        // Under the call's text, past its icon (size-3.5) and gap (gap-2).
        <div className="flex gap-2">
          <span className="w-3.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            {message.output.map((line) => (
              <p key={line} className={`${appInk.codeMeta} break-words`}>
                {line}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </motion.div>
  )
}
