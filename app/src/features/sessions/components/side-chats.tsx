import { Link } from '@tanstack/react-router'
import { MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import type { SessionEntry } from '../model/facets'
import { StatusIcon } from './status-icon'
import { box, text, textRole } from '@/components/ui/styles'
import { RowToggle } from '@/components/ui/row-toggle'

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
    <div>
      <RowToggle
        icon={<MessageSquareText />}
        label={`${entries.length} side chat${entries.length === 1 ? '' : 's'}`}
        unread={unread}
        open={open}
        onToggle={() => setOpen(!open)}
      />
      {open ? (
        <ul aria-label="Side chats" className={`${box({ edge: 'left' })} flex flex-col`}>
          {entries.map((entry) => (
            <li key={entry.key}>
              <Link
                to="/d/$daemonId/s/$sessionId"
                params={{ daemonId: entry.daemon.id, sessionId: entry.session.id }}
                search={true}
                aria-current={entry.key === selectedKey ? 'page' : undefined}
                className={cn(
                  box({ radius: 'end', hover: 'muted', ground: entry.key === selectedKey ? 'muted' : undefined }),
                  text({ size: 'sm' }),
                  'flex items-center gap-2 py-1.5 pr-2 pl-3',
                )}
              >
                <StatusIcon state={entry.session.state} unread={entry.session.unread} className="size-3.5 shrink-0" />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate',
                    entry.session.unread ? text({ weight: 'medium', tone: 'fg' }) : text({ tone: 'muted' }),
                  )}
                >
                  {aboutOf(entry)}
                </span>
                <time className={`${text({ numeric: true })} ${textRole.meta} shrink-0`} dateTime={entry.session.updated_at}>
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
