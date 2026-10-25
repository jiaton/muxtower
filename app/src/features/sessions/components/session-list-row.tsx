import { MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SwipeAction, SwipeActions } from '@/components/ui/swipe-actions'
import type { SessionEntry } from '../model/facets'
import { SessionActions } from './session-actions'
import { SessionActionItems } from './session-actions-menu'
import { SessionRow, type RowContext } from './session-row'

/** A row of the session list with its actions: swipe right on a touch screen, or the "⋯" that shows on
 *  hover with a mouse. */
export function SessionListRow({
  entry,
  selected,
  context,
  children,
}: {
  entry: SessionEntry
  selected?: boolean
  context?: RowContext
  children?: ReactNode
}) {
  const { daemon, session } = entry
  return (
    <SessionActions daemonId={daemon.id} session={session}>
      {(actions) => (
        <SwipeActions
          actions={actions.map((a) => (
            <SwipeAction key={a.id} icon={a.icon} label={a.label} tone={a.tone} onClick={a.run} />
          ))}
        >
          <div className="group relative">
            <SessionRow entry={entry} selected={selected} context={context}>
              {children}
            </SessionRow>
            <div className="absolute top-2 right-2 hidden opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100 pointer-fine:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="icon-sm" aria-label={`Actions for ${session.name}`} title="Actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <SessionActionItems session={session} actions={actions} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </SwipeActions>
      )}
    </SessionActions>
  )
}
