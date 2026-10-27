import { Bell, BellDot, BellOff, type LucideIcon } from 'lucide-react'
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import type { NotifyLevel, Session } from '@/lib/api/types'
import { useSessionNotify } from '../api/use-session-marks'

export const NOTIFY_LEVELS: { level: NotifyLevel; label: string; hint: string; icon: LucideIcon }[] = [
  { level: 'all', label: 'All', hint: 'Prompts and every finished turn', icon: Bell },
  { level: 'needs', label: 'Only when it needs me', hint: 'Prompts, and turns that leave you something', icon: BellDot },
  { level: 'off', label: 'Off', hint: 'Nothing from this session', icon: BellOff },
]

/** Which push notifications a session sends, as radio items in its menus; kept on its daemon, so the
 *  same on every device. "Only when it needs me" suits a session that checks on something every few
 *  minutes. */
export function NotifyItems({ daemonId, session }: { daemonId: string; session: Session }) {
  const notify = useSessionNotify()
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
              <span className="text-xs text-fg-muted">{hint}</span>
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}
