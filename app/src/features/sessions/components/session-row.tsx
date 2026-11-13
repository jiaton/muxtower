import { Link } from '@tanstack/react-router'
import { GitCompareArrows } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { NO_ENVIRONMENT, agentOf, deviceOf, folderName, folderOf, isAssistant, sourceOf, type SessionEntry } from '../model/facets'
import { alsoWritingText } from '../model/writes'
import { AgentMark } from './agent-mark'
import { NOTIFY_LEVELS } from './notify-items'
import { StatusIcon } from './status-icon'
import { box, text, textRole } from '@/components/ui/styles'
import { listRow, listRowBelow } from '@/components/ui/list-row'

export interface RowContext {
  /** The list is already narrowed to one device / folder: do not repeat it on every row. */
  hideDevice?: boolean
  hideFolder?: boolean
  hideSource?: boolean
  /** Several daemons are paired: say which one reported the session. */
  showDaemon?: boolean
  /** Sessions run as more than one account: say which this one runs as. */
  showAccount?: boolean
  /** The list holds more than one agent (Claude Code, Codex…): mark which this one is. */
  showAgent?: boolean
  /** Listed under the session it was forked from: the tree already says it is a fork. */
  nested?: boolean
}

/** One line of Markdown as plain text: no emphasis marks, code ticks or heading hashes. */
const plain = (text: string) =>
  text
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** What the agent is asking, or else what it did last, in one line. */
function lineOf({ session }: SessionEntry): { text: string; asking: boolean } | null {
  const pending = session.needs_attention ? session.pending : null
  if (pending?.detail || pending?.tool_name) return { text: [pending.tool_name, pending.detail].filter(Boolean).join(': '), asking: true }
  const said = session.summary?.needs || session.summary?.detail || session.summary?.recent || session.last_message
  return said ? { text: plain(said), asking: false } : null
}

/** One session in a list: state, name, when, which agent (when the list holds several), where (device ·
 *  folder · source), and one line of what it says or asks. `children` is a slot under it (e.g. quick approval buttons). */
export function SessionRow({
  entry,
  selected,
  context = {},
  children,
}: {
  entry: SessionEntry
  selected?: boolean
  context?: RowContext
  children?: ReactNode
}) {
  const { daemon, session } = entry
  const folder = folderOf(session)
  const where = [
    session.team_role,
    session.fork_of && !context.nested ? (session.side_chat ? 'Side chat' : 'Fork') : null,
    context.showDaemon ? daemon.name : null,
    context.hideDevice ? null : (deviceOf(session) ?? NO_ENVIRONMENT),
    context.hideFolder || !folder ? null : folderName(folder),
    context.hideSource ? null : sourceOf(session),
    context.showAccount && session.account ? session.account : null,
  ].filter(Boolean)
  const line = lineOf(entry)
  const writing = alsoWritingText(session)
  const quieter = session.notify !== 'all' ? NOTIFY_LEVELS.find((l) => l.level === session.notify) : undefined

  return (
    <div className={cn(box({ edge: 'bottom' }), selected && box({ ground: 'muted' }), session.offline && box({ faded: 'dim' }))}>
      <Link
        to="/d/$daemonId/s/$sessionId"
        params={{ daemonId: daemon.id, sessionId: session.id }}
        search={true}
        aria-current={selected ? 'page' : undefined}
        className={listRow()}
      >
        <StatusIcon state={session.state} assistant={isAssistant(session)} unread={session.unread} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                session.unread || session.needs_attention ? text({ weight: 'semibold' }) : text({ weight: 'medium' }),
              )}
            >
              {session.name}
            </span>
            {writing ? (
              <span title={writing} className="shrink-0 self-center">
                <GitCompareArrows className={`${text({ tone: 'warning' })} size-3.5`} role="img" aria-label={writing} />
              </span>
            ) : null}
            {quieter ? (
              <quieter.icon
                className={`${text({ tone: 'muted' })} size-3.5 shrink-0 self-center`}
                role="img"
                aria-label={`Notifications: ${quieter.label}`}
              />
            ) : null}
            <time
              className={cn(
                `${text({ size: 'xs', numeric: true })} shrink-0`,
                session.unread ? text({ weight: 'medium', tone: 'accent' }) : text({ tone: 'muted' }),
              )}
              dateTime={session.updated_at}
              title={new Date(session.updated_at).toLocaleString()}
            >
              {ago(session.updated_at)}
            </time>
          </div>
          <p className={`${textRole.meta} flex items-center gap-1`}>
            {context.showAgent ? <AgentMark agent={agentOf(session)} className={text({ tone: 'fg' })} /> : null}
            <span className="min-w-0 truncate">
              {session.offline ? <span className={text({ weight: 'medium', tone: 'fg' })}>Offline · </span> : null}
              {where.join(' · ')}
            </span>
          </p>
          {line ? (
            <p className={cn(`${text({ size: 'sm' })} mt-0.5 line-clamp-1`, line.asking ? text({ tone: 'fg' }) : text({ tone: 'muted' }))}>
              {line.text}
            </p>
          ) : null}
        </div>
      </Link>
      {children ? <div className={listRowBelow}>{children}</div> : null}
    </div>
  )
}
