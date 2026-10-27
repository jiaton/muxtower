import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { NO_ENVIRONMENT, deviceOf, folderName, folderOf, isAssistant, sourceOf, type SessionEntry } from '../model/facets'
import { NOTIFY_LEVELS } from './notify-items'
import { StatusIcon } from './status-icon'

export interface RowContext {
  /** The list is already narrowed to one device / folder: do not repeat it on every row. */
  hideDevice?: boolean
  hideFolder?: boolean
  hideSource?: boolean
  /** Several daemons are paired: say which one reported the session. */
  showDaemon?: boolean
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

/** One session in a list: state, name, when, where (device · folder · source), and one line of what it
 *  says or asks. `children` is a slot under it (e.g. quick approval buttons). */
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
    context.showDaemon ? daemon.name : null,
    context.hideDevice ? null : (deviceOf(session) ?? NO_ENVIRONMENT),
    context.hideFolder || !folder ? null : folderName(folder),
    context.hideSource ? null : sourceOf(session),
  ].filter(Boolean)
  const line = lineOf(entry)
  const quieter = session.notify !== 'all' ? NOTIFY_LEVELS.find((l) => l.level === session.notify) : undefined

  return (
    <div className={cn('border-b border-border', selected && 'bg-surface-muted')}>
      <Link
        to="/d/$daemonId/s/$sessionId"
        params={{ daemonId: daemon.id, sessionId: session.id }}
        search={true}
        aria-current={selected ? 'page' : undefined}
        className="flex gap-3 px-3 py-2.5 outline-none hover:bg-surface-muted focus-visible:bg-surface-muted sm:px-4"
      >
        <StatusIcon state={session.state} assistant={isAssistant(session)} unread={session.unread} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn('min-w-0 flex-1 truncate', session.unread || session.needs_attention ? 'font-semibold' : 'font-medium')}>
              {session.name}
            </span>
            {quieter ? (
              <quieter.icon className="size-3.5 shrink-0 self-center text-fg-muted" role="img" aria-label={`Notifications: ${quieter.label}`} />
            ) : null}
            <time
              className={cn('shrink-0 text-xs tabular-nums', session.unread ? 'font-medium text-accent' : 'text-fg-muted')}
              dateTime={session.updated_at}
              title={new Date(session.updated_at).toLocaleString()}
            >
              {ago(session.updated_at)}
            </time>
          </div>
          <p className="truncate text-xs text-fg-muted">{where.join(' · ')}</p>
          {line ? <p className={cn('mt-0.5 line-clamp-1 text-sm', line.asking ? 'text-fg' : 'text-fg-muted')}>{line.text}</p> : null}
        </div>
      </Link>
      {children ? <div className="px-3 pb-3 pl-10 sm:px-4 sm:pl-11">{children}</div> : null}
    </div>
  )
}
