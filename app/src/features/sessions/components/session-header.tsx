import { Menu } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PaneHeader } from '@/components/ui/pane'
import type { Session } from '@/lib/api/types'
import { NO_ENVIRONMENT, deviceOf, folderOf, sourceOf } from '../model/facets'
import { useSessionDrawer } from '../store'
import { StateBadge } from './state-badge'

/** The top of a session page: the list as a drawer (phones), name and state, where it runs, and the
 *  page's actions. */
export function SessionHeader({ session, actions }: { session: Session; actions?: ReactNode }) {
  const drawerOpen = useSessionDrawer((s) => s.open)
  const setDrawer = useSessionDrawer((s) => s.setOpen)
  const where = [deviceOf(session) ?? NO_ENVIRONMENT, folderOf(session), sourceOf(session), session.runtime].filter(Boolean)
  return (
    <PaneHeader
      leading={
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-1 md:hidden"
          aria-label="Sessions"
          aria-expanded={drawerOpen}
          title="Sessions"
          onClick={() => setDrawer(true)}
        >
          <Menu />
        </Button>
      }
      title={
        <>
          <h1 className="min-w-0 truncate">{session.name}</h1>
          {session.archived_at ? <Badge>Archived</Badge> : session.offline ? <Badge>Offline</Badge> : <StateBadge state={session.state} />}
        </>
      }
      subtitle={<span title={session.cwd || undefined}>{where.join(' · ')}</span>}
      actions={actions}
    />
  )
}
