import { Link } from '@tanstack/react-router'
import { ChevronRight, MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import type { SessionEntry } from '../model/facets'
import { StatusIcon } from './status-icon'
import { textRole } from '@/components/ui/styles'

/** What a side chat is about: its last word, else that it is one (its name is its parent's). */
const aboutOf = ({ session }: SessionEntry) =>
  (session.summary?.detail || session.summary?.recent || session.last_message || '').replace(/\s+/g, ' ').trim() || 'Side chat'

/** The side chats held by a row, folded to one line under it ("2 side chats") that opens to them: each a
 *  short line on a rule, opening that side chat. Open while one of them is the page shown. Sits in the
 *  row's slot, under what it says. */
export function SideChats({ entries, selectedKey }: { entries: SessionEntry[]; selectedKey?: string }) {
  const [open, setOpen] = useState(() => entries.some((e) => e.key === selectedKey))
  const unread = entries.filter((e) => e.session.unread).length // still seen when folded
  return (
    <div className="-mt-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`${textRole.meta} flex items-center gap-1.5 py-1 hover:text-fg`}
      >
        <MessageSquareText className="size-3.5" aria-hidden />
        {entries.length} side chat{entries.length === 1 ? '' : 's'}
        {unread ? <span className="font-medium text-accent">· {unread} unread</span> : null}
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} aria-hidden />
      </button>
      {open ? (
        <ul aria-label="Side chats" className="flex flex-col border-l border-border">
          {entries.map((entry) => (
            <li key={entry.key}>
              <Link
                to="/d/$daemonId/s/$sessionId"
                params={{ daemonId: entry.daemon.id, sessionId: entry.session.id }}
                search={true}
                aria-current={entry.key === selectedKey ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-r-md py-1.5 pr-2 pl-3 text-sm hover:bg-surface-muted',
                  entry.key === selectedKey && 'bg-surface-muted',
                )}
              >
                <StatusIcon state={entry.session.state} unread={entry.session.unread} className="size-3.5 shrink-0" />
                <span className={cn('min-w-0 flex-1 truncate', entry.session.unread ? 'font-medium text-fg' : 'text-fg-muted')}>
                  {aboutOf(entry)}
                </span>
                <time className={`${textRole.meta} shrink-0 tabular-nums`} dateTime={entry.session.updated_at}>
                  {ago(entry.session.updated_at)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
