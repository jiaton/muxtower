import { useMatch } from '@tanstack/react-router'
import { MoreHorizontal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SwipeAction, SwipeActions } from '@/components/ui/swipe-actions'
import type { SessionEntry } from '../model/facets'
import { SessionActions, type SessionAction } from './session-actions'
import { SessionActionItems, SessionEndItems } from './session-actions-menu'
import { NotifyItems } from './notify-items'
import { SessionRow, type RowContext } from './session-row'

const AT_NAME = { x: 40, y: 28 } // a menu opened from the keyboard: under the row's name

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
  // The session shown on the page (not merely marked, as a phone's list marks the one just left): marking
  // it unread, hiding or deleting it from its row leaves it first, or being on screen would read it again.
  const page = useMatch({ from: '/_sessions/d/$daemonId/s/$sessionId', shouldThrow: false })
  const open = page?.params.daemonId === daemon.id && page?.params.sessionId === session.id
  const [pressed, setPressed] = useState<{ x: number; y: number } | null>(null)
  const items = (actions: SessionAction[]) => (
    <>
      <SessionActionItems session={session} actions={actions} />
      <NotifyItems daemonId={daemon.id} session={session} />
      <SessionEndItems session={session} actions={actions} />
    </>
  )
  return (
    <SessionActions daemonId={daemon.id} session={session} open={open}>
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
              // From the keyboard (the menu key) it has no place: under the row's name.
              const keyed = e.clientX === 0 && e.clientY === 0
              setPressed(keyed ? AT_NAME : { x: e.clientX - box.left, y: e.clientY - box.top })
            }}
            onKeyDown={(e) => {
              // "." or Shift+F10 on the focused row: its menu, where its keys act (`ACTION_KEYS`).
              if (e.ctrlKey || e.metaKey || e.altKey) return
              if (e.key === '.' || (e.key === 'F10' && e.shiftKey)) {
                e.preventDefault()
                setPressed(AT_NAME)
              }
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
