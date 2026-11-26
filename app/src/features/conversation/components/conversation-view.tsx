import { Clamp } from '@/components/ui/clamp'
import { ArrowDown, CircleX, RotateCw, X } from 'lucide-react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import type { ConversationItem } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import type { ShownOutgoing } from '@/lib/outbox'
import { conversationMedia, itemMedia } from '../model/gallery'
import { conversationRows, toolName, toolRunSummary } from '../model/rows'
import { ConversationGallery, ConversationImages } from './conversation-images'
import { SharedFileItem } from './shared-file'
import { NextStepCard } from './next-step-card'
import { Chevron, Spinner } from '@/components/ui/indicators'
import { bubble, found, ink, look } from '@/components/ui/intents'
import { Banner } from '@/components/ui/banner'

const BOTTOM_SLACK = 24
const FOUND_MS = 2500 // how long the item a search led to stays outlined
/** How long a message the agent has not taken in waits before it offers to be sent again. */
export const SEND_AGAIN_MS = 10 * 60_000

/** Where the conversation is read from, for the images and shared files its items show. */
export interface ConversationSource {
  daemonId: string
  sessionId: string
}

// A row is drawn again only when what it shows changed (items that did not keep their objects, `mergeItems`):
// a new item at the end of a long conversation does not parse every reply's Markdown again.
const sameSource = (a?: ConversationSource, b?: ConversationSource) =>
  a === b || (!!a && !!b && a.daemonId === b.daemonId && a.sessionId === b.sessionId)
const sameItem = (a: { item: ConversationItem; source?: ConversationSource; focused?: boolean }, b: typeof a) =>
  a.item === b.item && a.focused === b.focused && sameSource(a.source, b.source)
const sameRun = (a: { tools: ConversationItem[]; source?: ConversationSource }, b: typeof a) =>
  a.tools.length === b.tools.length && a.tools.every((t, i) => t === b.tools[i]) && sameSource(a.source, b.source)

/** What these items show under them (`itemMedia`), each once. */
function Images({ source, items }: { source?: ConversationSource; items: ConversationItem[] }) {
  const media = useMemo(() => [...new Map(items.flatMap(itemMedia).map((m) => [m.key, m])).values()], [items])
  return source ? <ConversationImages daemonId={source.daemonId} sessionId={source.sessionId} media={media} /> : null
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

const ItemView = memo(function ItemView({
  item,
  source,
  focused = false,
}: {
  item: ConversationItem
  source?: ConversationSource
  focused?: boolean
}) {
  if (item.kind === 'prompt')
    return (
      <div className="flex flex-col items-end gap-2">
        <div className={bubble({ state: 'prompt', focused })}>
          <Clamp key={String(focused)} open={focused}>
            {item.text}
          </Clamp>
        </div>
        <Images source={source} items={[item]} />
      </div>
    )
  if (item.kind === 'reply')
    return (
      <div className={cn('flex flex-col gap-2', found(focused))}>
        <Markdown>{item.text ?? ''}</Markdown>
        <Images source={source} items={[item]} />
      </div>
    )
  if (item.kind === 'shared' && item.shared)
    return (
      <div className={found(focused)}>
        <SharedFileItem item={item} source={source} />
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

/** A message the conversation has that the agent has not taken in yet (a `pending` prompt): faded, with
 *  where it waits (`waiting`: the Claude app's Deliver, for a session open there); a while on, still not
 *  taken in (denied there, or the dialog put away), it offers to be sent again. */
function WaitingPrompt({ item, waiting, onSendAgain }: { item: ConversationItem; waiting: string; onSendAgain?: (text: string) => void }) {
  const [seen] = useState(() => Date.now())
  const since = item.at ? Date.parse(item.at) : seen
  const [late, setLate] = useState(() => Date.now() - since >= SEND_AGAIN_MS)
  useEffect(() => {
    if (late) return
    const timer = setTimeout(() => setLate(true), Math.max(0, since + SEND_AGAIN_MS - Date.now()))
    return () => clearTimeout(timer)
  }, [late, since])
  return (
    <div className="flex flex-col items-end gap-1" data-waiting>
      <div className={bubble({ state: 'pending' })}>
        <Clamp>{item.text}</Clamp>
      </div>
      <p className={cn('flex flex-wrap items-center justify-end gap-x-1', ink.meta)}>
        <span>{waiting}</span>
        {late && onSendAgain ? (
          <Button size="xs" variant="ghost" onClick={() => onSendAgain(item.text ?? '')}>
            <RotateCw aria-hidden /> Not delivered? Send again
          </Button>
        ) : null}
      </p>
    </div>
  )
}

const OUTGOING_LABEL: Record<ShownOutgoing['state'], string> = {
  sending: 'Sending',
  held: 'Waiting · goes in when the session is back at its prompt',
  queued: 'Queued · goes in at the agent’s next step',
  waiting: 'Sent',
  unconfirmed: 'Sent, not in the conversation yet',
  undelivered: 'Not delivered',
  failed: 'Not sent',
}

/** A message sent that the conversation does not have yet: a prompt, faded until it does. Queued while the
 *  agent works; one it did not take in (it stopped working without it) can be sent again; one either way
 *  not in the conversation can be put away (its text stays readable until then). */
function OutgoingView({
  message,
  onDismiss,
  onResend,
  sessionName,
}: {
  message: ShownOutgoing
  sessionName?: string
  onDismiss?: (id: string) => void
  onResend?: (message: ShownOutgoing) => void
}) {
  const stuck = message.state === 'unconfirmed' || message.state === 'undelivered' || message.state === 'failed'
  const failed = message.state === 'failed'
  return (
    <div className="flex flex-col items-end gap-1" data-outgoing={message.state}>
      <div className={bubble({ state: message.state === 'undelivered' || failed ? 'undelivered' : 'pending' })}>
        <Clamp>{message.text}</Clamp>
      </div>
      <p
        role={failed ? 'alert' : undefined}
        className={cn('flex items-center gap-1', failed ? ink.noteDanger : message.state === 'undelivered' ? ink.noteWarning : ink.meta)}
      >
        {message.state === 'sending' ? <Spinner className="size-3" /> : null}
        {failed && message.failed
          ? `Not sent: ${message.failed}`
          : message.state === 'held' && sessionName
            ? `Waiting · goes in when ${sessionName} is back at its prompt`
            : OUTGOING_LABEL[message.state]}
        {(message.state === 'undelivered' || failed) && onResend ? (
          <Button size="xs" variant="ghost" onClick={() => onResend(message)}>
            <RotateCw aria-hidden /> {failed ? 'Retry' : 'Resend'}
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
  focus,
  earlier,
  sessionName,
  waiting = 'Not taken in yet',
  onSendAgain,
}: {
  items: ConversationItem[]
  pending?: ShownOutgoing[]
  onDismiss?: (id: string) => void
  onResend?: (message: ShownOutgoing) => void
  onReply?: (text: string) => void
  source?: ConversationSource
  /** The item a search led to: scrolled to and outlined for a moment, shown whole. */
  focus?: number
  /** Showing an earlier part (from `focus` on), not the latest: what takes it back to the latest. */
  earlier?: () => void
  /** Said of a message held while the session shows a dialog. */
  sessionName?: string
  /** Said under a message the agent has not taken in yet (a `pending` prompt). */
  waiting?: string
  /** Sends a message that was not taken in again. */
  onSendAgain?: (text: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState<number | undefined>(undefined)
  const atBottom = useRef(true)
  const [behind, setBehind] = useState(false)
  const shown = conversationRows(items)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || focus !== undefined) return
    if (atBottom.current) el.scrollTop = el.scrollHeight
    else setBehind(true)
  }, [items, pending.length, focus])

  // Led here by a search: to its item, outlined for a moment, once it is shown.
  const hasFocus = focus !== undefined && items.some((i) => i.seq === focus)
  useEffect(() => {
    if (!hasFocus) return
    setFocused(focus)
    atBottom.current = false
    scroller.current?.querySelector(`[data-seq="${focus}"]`)?.scrollIntoView?.({ block: 'center' })
    const done = setTimeout(() => setFocused(undefined), FOUND_MS)
    return () => clearTimeout(done)
  }, [focus, hasFocus])

  // Every picture and video the conversation shows, shared ones too, in its order: one gallery (a tap on
  // any opens it there).
  const allMedia = useMemo(() => conversationMedia(items), [items])
  const view = (
    <div className={`${look.surface} relative flex min-h-0 flex-1 flex-col overflow-hidden`}>
      <div
        ref={scroller}
        role="log"
        aria-label="Conversation"
        data-component="conversation"
        data-bounded // its items are kept to a bound (diagnostics measure growth without them)
        tabIndex={0}
        className={`${ink.body} flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain p-3`}
        onScroll={() => {
          const el = scroller.current!
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK
          if (atBottom.current) setBehind(false)
        }}
      >
        {earlier ? (
          <Banner
            tone="info"
            action={
              <Button size="sm" variant="ghost" onClick={earlier}>
                Back to the latest
              </Button>
            }
          >
            An earlier part of the conversation, from what was found.
          </Banner>
        ) : null}
        {shown.length === 0 && pending.length === 0 ? <p className={ink.quiet}>No messages yet.</p> : null}
        {shown.map((row) =>
          row.kind === 'tools' ? (
            <ToolRun key={`t${row.items[0].seq}`} tools={row.items} source={source} />
          ) : row.kind === 'next' ? (
            pending.length ? null : (
              <NextStepCard key={`n${row.item.seq}`} item={row.item} onReply={onReply} />
            )
          ) : row.item.kind === 'prompt' && row.item.status === 'pending' ? (
            <div key={row.item.seq} data-seq={row.item.seq}>
              <WaitingPrompt item={row.item} waiting={waiting} onSendAgain={onSendAgain} />
            </div>
          ) : (
            <div key={row.item.seq} data-seq={row.item.seq}>
              <ItemView item={row.item} source={source} focused={row.item.seq === focused} />
            </div>
          ),
        )}
        {pending.map((message) => (
          <OutgoingView key={message.id} message={message} onDismiss={onDismiss} onResend={onResend} sessionName={sessionName} />
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
  return source ? (
    <ConversationGallery daemonId={source.daemonId} sessionId={source.sessionId} media={allMedia}>
      {view}
    </ConversationGallery>
  ) : (
    view
  )
}
