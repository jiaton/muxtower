import { Bell, BellDot, BellOff, CheckCheck, type LucideIcon } from 'lucide-react'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import type { NotifyLevel, Session } from '@/lib/api/types'
import { useSessionAutoRead, useSessionNotify } from '../api/use-session-marks'
import { ink } from '@/components/ui/intents'

export const NOTIFY_LEVELS: { level: NotifyLevel; label: string; hint: string; icon: LucideIcon }[] = [
  { level: 'all', label: 'All', hint: 'Prompts and every finished turn', icon: Bell },
  { level: 'needs', label: 'Only when it needs me', hint: 'Prompts, approvals and questions only', icon: BellDot },
  { level: 'off', label: 'Off', hint: 'Nothing from this session', icon: BellOff },
]

/** "Mark read automatically": its finished turns never make it unread. Also the row's hint. */
export const AUTO_READ = { label: 'Mark read automatically', hint: 'Finished turns never show as unread', icon: CheckCheck }

/** Which push notifications a session sends, as radio items in its menus; kept on its daemon, so the
 *  same on every device. "Only when it needs me" suits a session that checks on something every few
 *  minutes. With them, whether its finished turns are marked read as they end: with "Only when it needs
 *  me", the quiet setup for a chatty worker. */
export function NotifyItems({ daemonId, session }: { daemonId: string; session: Session }) {
  const notify = useSessionNotify()
  const autoRead = useSessionAutoRead()
  if (session.archived_at) return null
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Notifications</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={session.notify}
        onValueChange={(level) => notify.mutate({ daemonId, sessionId: session.id, level: level as NotifyLevel })}
      >
        {NOTIFY_LEVELS.map(({ level, label, hint, icon: Icon }) => (
          <DropdownMenuRadioItem key={level} value={level} className="py-1.5">
            <Icon />
            <span className="flex flex-col">
              {label}
              <span className={ink.meta}>{hint}</span>
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuCheckboxItem
        checked={session.auto_read}
        onCheckedChange={(on) => autoRead.mutate({ daemonId, sessionId: session.id, autoRead: on })}
        className="py-1.5"
      >
        <AUTO_READ.icon />
        <span className="flex flex-col">
          {AUTO_READ.label}
          <span className={ink.meta}>{AUTO_READ.hint}</span>
        </span>
      </DropdownMenuCheckboxItem>
    </>
  )
}
