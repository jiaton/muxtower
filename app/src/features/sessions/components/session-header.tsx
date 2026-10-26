import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PaneHeader } from '@/components/ui/pane'
import type { Session } from '@/lib/api/types'
import { OTHER_DEVICES, deviceOf, folderOf, sourceOf } from '../model/facets'
import { StateBadge } from './state-badge'

/** The top of a session page: back (phones), name and state, where it runs, and the page's actions. */
export function SessionHeader({ session, actions }: { session: Session; actions?: ReactNode }) {
  const where = [deviceOf(session) ?? OTHER_DEVICES, folderOf(session), sourceOf(session), session.runtime].filter(Boolean)
  return (
    <PaneHeader
      leading={
        <Button asChild variant="ghost" size="icon-sm" className="-ml-1 md:hidden" aria-label="Back to sessions">
          <Link to="/" search={true}>
            <ArrowLeft />
          </Link>
        </Button>
      }
      title={
        <>
          <h1 className="min-w-0 truncate">{session.name}</h1>
          {session.archived_at ? <Badge>Archived</Badge> : <StateBadge state={session.state} />}
        </>
      }
      subtitle={<span title={session.cwd || undefined}>{where.join(' · ')}</span>}
      actions={actions}
    />
  )
}
