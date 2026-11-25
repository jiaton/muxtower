import { Link } from '@tanstack/react-router'
import { GitCompareArrows } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { DIALOG_KIND, DIALOG_REASON } from '@/lib/agent-state'
import type { Belongings } from '../model/belongs'
import {
  NO_ENVIRONMENT,
  agentOf,
  deviceOf,
  folderName,
  folderOf,
  isAssistant,
  roleShown,
  sourceOf,
  type SessionEntry,
} from '../model/facets'
import { alsoWritingText } from '../model/writes'
import { AgentMark } from './agent-mark'
import { AUTO_READ, NOTIFY_LEVELS } from './notify-items'
import { StatusIcon } from '@/components/ui/status-icon'
import { listRow, listRowBelow } from '@/components/ui/list-row'
import { ink, listItem, look } from '@/components/ui/intents'

export interface RowContext {
  /** In a drawer: a session opened replaces the page the drawer opened on (whose Back closed it). */
  replace?: boolean
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
  /** In a group of sessions on several devices (a project's): the device as a tag by the name. */
  deviceTag?: boolean
  /** Sessions picked by role (every project's PM): each row says which project, as a tag. */
  projectTag?: boolean
  /** Where each session belongs, among every known one (`belongingsOf`): what the project tag says. */
  places?: Belongings
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
  if (pending?.kind === DIALOG_KIND)
    return { text: pending.detail ? `${DIALOG_REASON}: ${pending.detail}` : DIALOG_REASON, asking: true }
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
    roleShown(session),
    session.fork_of && !context.nested ? (session.side_chat ? 'Side chat' : 'Fork') : null,
    context.showDaemon ? daemon.name : null,
    context.hideDevice || context.deviceTag ? null : (deviceOf(session) ?? NO_ENVIRONMENT),
    context.hideFolder || !folder ? null : folderName(folder),
    context.hideSource ? null : sourceOf(session),
    context.showAccount && session.account ? session.account : null,
  ].filter(Boolean)
  const line = lineOf(entry)
  const writing = alsoWritingText(session)
  const quieter = session.notify !== 'all' ? NOTIFY_LEVELS.find((l) => l.level === session.notify) : undefined

  return (
    <div className={listItem({ selected, dim: session.offline })}>
      <Link
        to="/d/$daemonId/s/$sessionId"
        params={{ daemonId: daemon.id, sessionId: session.id }}
        search={true}
        replace={context.replace}
        aria-current={selected ? 'page' : undefined}
        data-row-link
        className={listRow()}
      >
        <StatusIcon state={session.state} assistant={isAssistant(session)} unread={session.unread} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn('min-w-0 flex-1 truncate', session.unread || session.needs_attention ? ink.emphasis : ink.strong)}>
              {session.name}
            </span>
            {context.projectTag && context.places ? (
              <span className={`${look.tag} max-w-40 shrink-0 self-center truncate`}>{context.places(entry).name}</span>
            ) : null}
            {context.deviceTag ? <span className={`${look.tag} shrink-0 self-center`}>{deviceOf(session) ?? NO_ENVIRONMENT}</span> : null}
            {writing ? (
              <span title={writing} className="shrink-0 self-center">
                <GitCompareArrows className={`${ink.warning} size-3.5`} role="img" aria-label={writing} />
              </span>
            ) : null}
            {quieter ? (
              <quieter.icon
                className={`${ink.quiet} size-3.5 shrink-0 self-center`}
                role="img"
                aria-label={`Notifications: ${quieter.label}`}
              />
            ) : null}
            {session.auto_read ? (
              <AUTO_READ.icon className={`${ink.quiet} size-3.5 shrink-0 self-center`} role="img" aria-label={AUTO_READ.label} />
            ) : null}
            <time
              // Where the row's ⋯ shows (pointed at, focused, its menu open), it takes the time's place.
              className={cn(
                session.unread ? ink.noteAccent : ink.meta,
                ink.count,
                'shrink-0 pointer-fine:group-focus-within:invisible pointer-fine:group-hover:invisible pointer-fine:group-has-[[data-state=open]]:invisible',
              )}
              dateTime={session.updated_at}
              title={new Date(session.updated_at).toLocaleString()}
            >
              {ago(session.updated_at)}
            </time>
          </div>
          <p className={`${ink.meta} flex items-center gap-1`}>
            {context.showAgent ? <AgentMark agent={agentOf(session)} className={ink.normal} /> : null}
            <span className="min-w-0 truncate">
              {session.offline ? <span className={ink.strong}>Offline · </span> : null}
              {where.join(' · ')}
            </span>
          </p>
          {line ? <p className={cn('mt-0.5 line-clamp-1', line.asking ? ink.body : ink.hint)}>{line.text}</p> : null}
        </div>
      </Link>
      {children ? <div className={listRowBelow}>{children}</div> : null}
    </div>
  )
}
