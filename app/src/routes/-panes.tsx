import { LayoutSwitch, ShowPanesButton } from '@/components/ui/layout-switch'
import { useDaemonsNeedALook } from '@/features/daemons/hooks/use-daemons-need-a-look'
import { useSessionEntries } from '@/features/sessions/hooks/use-session-entries'
import { facetsOf } from '@/features/sessions/model/counts'
import { useLayoutDrawer } from '@/lib/layout-drawer'
import { LAYOUT_LABEL, layoutsFor, useLayoutPrefs, usePanes, type Layout } from '@/lib/layout-prefs'

const PANES: Record<Layout, 1 | 2 | 3> = { full: 3, list: 2, session: 1 }

/** The panel-left at the top-left of the leftmost pane showing, while the layout hides some: opens the
 *  one drawer. "Show sessions" when the list is hidden too (with the sidebar, from `md`), else "Show the
 *  sidebar". It carries how many sessions need the owner, and a dot when a daemon wants a look. */
export function ShowPanes({ list }: { list: boolean }) {
  const { entries } = useSessionEntries()
  const needs = facetsOf(entries).views.needs
  const look = useDaemonsNeedALook()
  const open = useLayoutDrawer((s) => s.open)
  const setOpen = useLayoutDrawer((s) => s.setOpen)
  const base = list ? 'Show sessions' : 'Show the sidebar'
  const label = needs ? `${base} (${needs} need${needs === 1 ? 's' : ''} you)` : look ? `${base} (${look})` : base
  return <ShowPanesButton label={label} count={needs} alert={Boolean(look)} expanded={open} onClick={() => setOpen(true)} />
}

/** The layout switch, at the sidebar's top-left: the layouts this screen can show, the one shown filled.
 *  Picked from the drawer, the drawer closes (what it held may dock now). */
export function SidebarSwitch() {
  const { dock, split, shown } = usePanes(false)
  const setLayout = useLayoutPrefs((s) => s.setLayout)
  const close = useLayoutDrawer((s) => s.setOpen)
  if (!shown) return null
  return (
    <LayoutSwitch
      value={shown}
      options={layoutsFor({ dock, split }).map((l) => ({ value: l, label: LAYOUT_LABEL[l], panes: PANES[l] }))}
      onChange={(l) => {
        setLayout(l)
        close(false)
      }}
    />
  )
}
