import { ArrowDown, CircleX, RotateCw, X } from 'lucide-react'
import { memo, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import type { ConversationItem } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import type { ShownOutgoing } from '@/lib/outbox'
import { conversationRows, toolName, toolRunSummary } from '../model/rows'
import { ConversationImages } from './conversation-images'
import { NextStepCard } from './next-step-card'
import { Chevron, Spinner } from '@/components/ui/indicators'
import { bubble, ink, look } from '@/components/ui/intents'

const BOTTOM_SLACK = 24

/** Where the conversation is read from, for the images its items show. */
export interface ConversationSource {
  daemonId: string
  sessionId: string
}

// A row is drawn again only when what it shows changed (items that did not keep their objects, `mergeItems`):
// a new item at the end of a long conversation does not parse every reply's Markdown again.
const sameSource = (a?: ConversationSource, b?: ConversationSource) =>
  a === b || (!!a && !!b && a.daemonId === b.daemonId && a.sessionId === b.sessionId)
const sameItem = (a: { item: ConversationItem; source?: ConversationSource }, b: typeof a) =>
  a.item === b.item && sameSource(a.source, b.source)
const sameRun = (a: { tools: ConversationItem[]; source?: ConversationSource }, b: typeof a) =>
  a.tools.length === b.tools.length && a.tools.every((t, i) => t === b.tools[i]) && sameSource(a.source, b.source)

function Images({ source, items }: { source?: ConversationSource; items: ConversationItem[] }) {
  const paths = [...new Set(items.flatMap((item) => item.images ?? []))]
  return source ? <ConversationImages daemonId={source.daemonId} sessionId={source.sessionId} paths={paths} /> : null
}

/** A run of tool calls as one line ("Ran 4 commands (2 failed)", or a single call's own description)
 *  that opens to the calls themselves, so the prose stays readable. */
const ToolRun = memo(function ToolRun({ tools, source }: { tools: ConversationItem[]; source?: ConversationSource }) {
  const [open, setOpen] = useState(false)
  const summary = toolRunSummary(tools)
  return (
    <div>
      <Button
        variant="plain"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`${ink.quietAction} flex max-w-full items-start gap-1.5 text-left`}
      >
        {summary.running ? <Spinner className="mt-0.5" /> : null}
        <span className="min-w-0">
          {summary.text}
          {summary.failed ? <span className={ink.danger}> ({summary.failed} failed)</span> : null}
        </span>
        <Chevron open={open} className="mt-0.5 size-4" />
      </Button>
      {open ? (
        <ul className={`${look.rule.left} mt-2 flex flex-col gap-2 pl-3`}>
          {tools.map((tool) => (
            <li key={tool.seq} className="flex flex-col gap-1">
              <p className={`${ink.meta} flex items-center gap-1.5`}>
                {tool.status === 'running' ? <Spinner className="size-3.5" label="Running" /> : null}
                {tool.status === 'error' ? <CircleX className={`${ink.danger} size-3.5`} aria-label="Failed" /> : null}
                <span className={ink.strong}>{toolName(tool)}</span>
                {tool.description ? <span className="min-w-0 truncate">{tool.description}</span> : null}
              </p>
              {tool.text ? (
                <pre className={`${look.output} max-h-40 overflow-auto px-2 py-1 break-all whitespace-pre-wrap`}>{tool.text}</pre>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 empty:hidden">
        <Images source={source} items={tools} />
      </div>
    </div>
  )
}, sameRun)

const ItemView = memo(function ItemView({ item, source }: { item: ConversationItem; source?: ConversationSource }) {
  if (item.kind === 'prompt')
    return (
      <div className="flex flex-col items-end gap-2">
        <p className={bubble({ state: 'prompt' })}>{item.text}</p>
        <Images source={source} items={[item]} />
      </div>
    )
  if (item.kind === 'reply')
    return (
      <div className="flex flex-col gap-2">
        <Markdown>{item.text ?? ''}</Markdown>
        <Images source={source} items={[item]} />
      </div>
    )
  const label = item.kind === 'question' ? 'Question' : (item.tool_name ?? 'Approval')
  return (
    <div className={`${look.alertCard} ${ink.body} px-3 py-2`}>
      <p className={ink.strong}>
        {label} · <span className={ink.quiet}>{item.status}</span>
      </p>
      {item.text ? <pre className={`${ink.codeSmall} mt-1 whitespace-pre-wrap`}>{item.text}</pre> : null}
    </div>
  )
}, sameItem)

const OUTGOING_LABEL: Record<ShownOutgoing['state'], string> = {
  sending: 'Sending',
  queued: 'Queued · goes in at the agent’s next step',
  waiting: 'Sent',
  unconfirmed: 'Sent, not in the conversation yet',
  undelivered: 'Not delivered',
}

/** A message sent that the conversation does not have yet: a prompt, faded until it does. Queued while the
 *  agent works; one it did not take in (it stopped working without it) can be sent again; one either way
 *  not in the conversation can be put away (its text stays readable until then). */
function OutgoingView({
  message,
  onDismiss,
  onResend,
}: {
  message: ShownOutgoing
  onDismiss?: (id: string) => void
  onResend?: (message: ShownOutgoing) => void
}) {
  const stuck = message.state === 'unconfirmed' || message.state === 'undelivered'
  return (
    <div className="flex flex-col items-end gap-1" data-outgoing={message.state}>
      <p className={bubble({ state: message.state === 'undelivered' ? 'undelivered' : 'pending' })}>{message.text}</p>
      <p className={cn('flex items-center gap-1', message.state === 'undelivered' ? ink.noteWarning : ink.meta)}>
        {message.state === 'sending' ? <Spinner className="size-3" /> : null}
        {OUTGOING_LABEL[message.state]}
        {message.state === 'undelivered' && onResend ? (
          <Button size="xs" variant="ghost" onClick={() => onResend(message)}>
            <RotateCw aria-hidden /> Resend
          </Button>
        ) : null}
        {stuck && onDismiss ? (
          <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => onDismiss(message.id)}>
            <X aria-hidden />
          </Button>
        ) : null}
      </p>
    </div>
  )
}

/** The conversation as readable text: prompts, replies, folded tool runs, prompts to answer, then what
 *  was sent and is not in it yet (`pending`), or else the next step the agent offers (`onReply` sends a
 *  pick). The images items show come from `source`, under them. Follows new items while at the bottom;
 *  holds still while the reader is scrolled up. */
export function ConversationView({
  items,
  pending = [],
  onDismiss,
  onResend,
  onReply,
  source,
}: {
  items: ConversationItem[]
  pending?: ShownOutgoing[]
  onDismiss?: (id: string) => void
  onResend?: (message: ShownOutgoing) => void
  onReply?: (text: string) => void
  source?: ConversationSource
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const [behind, setBehind] = useState(false)
  const shown = conversationRows(items)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (atBottom.current) el.scrollTop = el.scrollHeight
    else setBehind(true)
  }, [items, pending.length])

  return (
    <div className={`${look.surface} relative flex min-h-0 flex-1 flex-col overflow-hidden`}>
      <div
        ref={scroller}
        role="log"
        aria-label="Conversation"
        tabIndex={0}
        className={`${ink.body} flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain p-3`}
        onScroll={() => {
          const el = scroller.current!
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK
          if (atBottom.current) setBehind(false)
        }}
      >
        {shown.length === 0 && pending.length === 0 ? <p className={ink.quiet}>No messages yet.</p> : null}
        {shown.map((row) =>
          row.kind === 'tools' ? (
            <ToolRun key={`t${row.items[0].seq}`} tools={row.items} source={source} />
          ) : row.kind === 'next' ? (
            pending.length ? null : (
              <NextStepCard key={`n${row.item.seq}`} item={row.item} onReply={onReply} />
            )
          ) : (
            <ItemView key={row.item.seq} item={row.item} source={source} />
          ),
        )}
        {pending.map((message) => (
          <OutgoingView key={message.id} message={message} onDismiss={onDismiss} onResend={onResend} />
        ))}
      </div>
      {behind ? (
        <Button
          size="sm"
          variant="secondary"
          floating
          className="absolute right-3 bottom-3"
          onClick={() => {
            const el = scroller.current!
            el.scrollTop = el.scrollHeight
            atBottom.current = true
            setBehind(false)
          }}
        >
          <ArrowDown /> New messages
        </Button>
      ) : null}
    </div>
  )
}
