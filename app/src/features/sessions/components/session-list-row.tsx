import { MoreHorizontal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SwipeAction, SwipeActions } from '@/components/ui/swipe-actions'
import type { SessionEntry } from '../model/facets'
import { SessionActions, type SessionAction } from './session-actions'
import { SessionActionItems } from './session-actions-menu'
import { NotifyItems } from './notify-items'
import { SessionRow, type RowContext } from './session-row'

/** A row of the session list with its actions: swipe right on a touch screen (renaming and moving are
 *  in the session's own menu), or the "⋯" that shows on hover with a mouse (which also sets its
 *  notifications; on a phone, the session's own menu does). A right click, or a long press where the
 *  browser takes it for one (Android), opens the same menu where it was pressed. */
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
  const [pressed, setPressed] = useState<{ x: number; y: number } | null>(null)
  const items = (actions: SessionAction[]) => (
    <>
      <SessionActionItems session={session} actions={actions} />
      <NotifyItems daemonId={daemon.id} session={session} />
    </>
  )
  return (
    <SessionActions daemonId={daemon.id} session={session}>
      {(actions) => (
        <SwipeActions
          actions={actions
            .filter((a) => !a.menuOnly)
            .map((a) => (
              <SwipeAction key={a.id} icon={a.icon} label={a.label} tone={a.tone} onClick={a.run} />
            ))}
        >
          <div
            className="group relative [-webkit-touch-callout:none]"
            onContextMenu={(e) => {
              e.preventDefault() // the browser's own menu (open in a new tab…) is not this row's
              const box = e.currentTarget.getBoundingClientRect()
              setPressed({ x: e.clientX - box.left, y: e.clientY - box.top })
            }}
          >
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
                <DropdownMenuContent align="end">{items(actions)}</DropdownMenuContent>
              </DropdownMenu>
            </div>
            <DropdownMenu open={Boolean(pressed)} onOpenChange={(open) => open || setPressed(null)}>
              <DropdownMenuTrigger asChild>
                <span
                  aria-hidden
                  tabIndex={-1}
                  className="pointer-events-none absolute size-0"
                  style={{ left: pressed?.x, top: pressed?.y }}
                />
              </DropdownMenuTrigger>
              {/* Clear of the finger: an item under the press would take the finger's lifting for a choice. */}
              <DropdownMenuContent align="start" sideOffset={12} onCloseAutoFocus={(e) => e.preventDefault()}>
                {items(actions)}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SwipeActions>
      )}
    </SessionActions>
  )
}
