import { Link, Outlet, createFileRoute, useMatch } from '@tanstack/react-router'
import { Archive, BellOff, CheckCheck, EyeOff, PanelLeft, Plus, RotateCcw, SearchX, Server } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { EmptyState } from '@/components/ui/empty-state'
import { Pane, PaneBody, PaneHeader } from '@/components/ui/pane'
import { QuickApproval } from '@/features/approval/components/quick-approval'
import { PairCodeForm } from '@/features/pairing/components/pair-code-form'
import { DaemonAlerts } from '@/features/sessions/components/daemon-alerts'
import { ArchiveTools } from '@/features/sessions/components/archive-tools'
import { InterruptedBanner } from '@/features/sessions/components/interrupted'
import { ExpiredLogins } from '@/features/daemons/components/expired-logins'
import { ListChips } from '@/features/sessions/components/list-chips'
import { ListMenu, ScopeChip, SearchField } from '@/features/sessions/components/list-controls'
import { useSidebarPull } from '@/features/sessions/hooks/use-sidebar-pull'
import { useSidebarDrawer } from '@/lib/sidebar-drawer'
import { SIDEBAR_QUERY } from '@/lib/use-media-query'
import { NewSessionDialog } from '@/features/sessions/components/new-session-dialog'
import { SessionList } from '@/features/sessions/components/session-list'
import { useOpenedHere } from '@/features/sessions/hooks/use-opened-here'
import { useScrollMemory } from '@/features/sessions/hooks/use-scroll-memory'
import { useSessionEntries } from '@/features/sessions/hooks/use-session-entries'
import { agentsDiffer, entryKey, folderName, isAssistant } from '@/features/sessions/model/facets'
import { keptEntries, keptGroups } from '@/features/sessions/model/kept'
import { facetsOf } from '@/features/sessions/model/counts'
import { filterEntries, groupEntries, queryTitle } from '@/features/sessions/model/query'
import { foldForks } from '@/features/sessions/model/forks'
import { foldSideChats } from '@/features/sessions/model/side-chats'
import { parseListSearch, toQuery } from '@/features/sessions/model/search'
import { useChipGroups } from '@/features/sessions/api/use-chip-groups'
import { chipMembers } from '@/features/sessions/model/chip-groups'
import { ProjectChips } from '@/features/sessions/components/project-chips'
import { useListMemory, useListPrefs, useSessionDrawer } from '@/features/sessions/store'
import { cn } from '@/lib/cn'
import { useUnpairedDaemons } from '@/lib/daemons/store'
import { SPLIT_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { box, text } from '@/components/ui/styles'

export const Route = createFileRoute('/_sessions')({ validateSearch: parseListSearch, component: SessionsLayout })

/**
 * The session list next to the open session (from `md`), or on phones the list alone and, while a
 * session is open, the list as a drawer over it (its header's menu button opens it). The list stays
 * mounted while a session is open, and keeps its scroll position per query.
 */
function SessionsLayout() {
  const search = Route.useSearch()
  const chipGroups = useChipGroups()
  const query = {
    ...toQuery(
      search,
      useListPrefs((s) => s.group),
    ),
    chip: chipMembers(search.chip, chipGroups) ?? undefined, // the second chip row's
  }
  const { entries, daemons, loading } = useSessionEntries()
  const unpaired = useUnpairedDaemons()
  const open = useMatch({ from: '/_sessions/d/$daemonId/s/$sessionId', shouldThrow: false })
  const split = useMediaQuery(SPLIT_QUERY)
  const docked = useMediaQuery(SIDEBAR_QUERY)
  const openSidebar = useSidebarDrawer((s) => s.setOpen)
  const listPane = useRef<HTMLElement>(null)
  useSidebarPull(listPane, !docked) // a swipe right on the list: the sidebar, one level up
  const listRef = useRef<HTMLDivElement>(null)
  const listKey = JSON.stringify(query)
  const asDrawer = Boolean(open) && !split
  const drawerOpen = useSessionDrawer((s) => s.open)
  const setDrawer = useSessionDrawer((s) => s.setOpen)
  const setPull = useSessionDrawer((s) => s.setPull)
  useEffect(() => {
    if (!asDrawer) setDrawer(false) // back on the list, or side by side: no drawer left open for later
  }, [asDrawer, setDrawer])
  useScrollMemory(listRef, listKey, !asDrawer || drawerOpen, !loading)
  useEffect(() => useListMemory.setState({ lastSearch: search }), [search])

  const visible = filterEntries(entries, query)
  const selectedKey = open ? entryKey(open.params.daemonId, open.params.sessionId) : undefined
  const opened = useOpenedHere(
    listKey,
    selectedKey,
    visible.some((e) => e.key === selectedKey),
  )
  const kept = keptEntries(entries, visible, opened, query)

  if (!daemons.length) return <Onboarding unpairedName={unpaired[0]?.name} unpairedUrl={unpaired[0]?.url} />

  // Side chats sit under the session they were asked beside, folded (one that needs you stays out);
  // forks are listed under the session they were forked from.
  const { shown: unfolded, sideChats } = foldSideChats(visible)
  const { shown, forks } = foldForks(unfolded)
  const groups = [...groupEntries(shown, query.group), ...keptGroups(kept)]
  const count = visible.filter((e) => !isAssistant(e.session)).length
  const facets = facetsOf(entries)
  const { title, within } = queryTitle(query)
  const counted = `${count} session${count === 1 ? '' : 's'}`

  return (
    <div className="flex min-w-0 flex-1">
      <Drawer drawer={asDrawer} open={drawerOpen} onOpenChange={setDrawer} onPull={setPull} label="Sessions">
        <Pane ref={listPane} className={`${box({ edge: 'right' })} flex w-full md:w-80 md:shrink-0 xl:w-96`} aria-label="Sessions">
          <PaneHeader
            leading={
              docked ? null : (
                <Button variant="ghost" size="icon-sm" aria-label="Open sidebar" title="Sidebar" onClick={() => openSidebar(true)}>
                  <PanelLeft />
                </Button>
              )
            }
            title={
              <h1 className="truncate" title={title}>
                {query.folder ? folderName(title) : title}
              </h1>
            }
            subtitle={within ? `${within} · ${counted}` : counted}
            actions={
              <>
                <ListMenu
                  query={query}
                  unread={visible.filter((e) => e.session.unread)}
                  agents={facets.agents.length > 0}
                  accounts={facets.accounts.length > 0}
                />
                <div className="lg:hidden">
                  <NewSessionDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label="New session" title="New session">
                        <Plus />
                      </Button>
                    }
                  />
                </div>
              </>
            }
          >
            <SearchField search={search} />
            <ListChips query={query} search={search} facets={facets} className="lg:hidden" />
            <ProjectChips query={query} search={search} entries={entries} groups={chipGroups} />
            <ScopeChip query={query} search={search} />
          </PaneHeader>
          <PaneBody ref={listRef}>
            <DaemonAlerts daemons={daemons} />
            <InterruptedBanner entries={entries} />
            {query.view === 'archived' ? <ArchiveTools entries={visible} /> : null}
            <ExpiredLogins />
            {groups.length ? (
              <SessionList
                groups={groups}
                held={{ sideChats, forks }}
                selectedKey={selectedKey}
                foldScope={query.view === 'archived' ? `archived:${query.group}` : query.group}
                foldedFirst={query.view === 'archived'}
                unfolded={Boolean(query.q?.trim())}
                context={{
                  hideDevice: Boolean(query.device),
                  hideFolder: Boolean(query.folder),
                  hideSource: Boolean(query.source),
                  showDaemon: daemons.filter((d) => !d.daemon.via).length > 1, // a hub's node reached directly is no daemon of its own
                  showAccount: facets.accounts.length > 0 && !query.account,
                  showAgent: agentsDiffer([...visible, ...kept].map((e) => e.session)),
                }}
                extra={({ daemon, session }) =>
                  session.needs_attention && session.pending ? (
                    <QuickApproval daemonId={daemon.id} sessionId={session.id} pending={session.pending} />
                  ) : null
                }
              />
            ) : loading ? null : (
              <div className="p-4">
                {query.q ? (
                  <EmptyState icon={<SearchX />} title={`No sessions match “${query.q}”`} />
                ) : query.view === 'needs' ? (
                  <EmptyState icon={<BellOff />} title="Nothing needs you right now" />
                ) : query.view === 'unread' ? (
                  <EmptyState icon={<CheckCheck />} title="All caught up" />
                ) : query.view === 'hidden' ? (
                  <EmptyState icon={<EyeOff />} title="Nothing hidden">
                    Swipe a session right, or use its menu, to hide it.
                  </EmptyState>
                ) : query.view === 'interrupted' ? (
                  <EmptyState icon={<RotateCcw />} title="Nothing interrupted">
                    Sessions a restart cut short wait here to be started again.
                  </EmptyState>
                ) : query.view === 'archived' ? (
                  <EmptyState icon={<Archive />} title="Nothing archived">
                    Archiving a session ends it and keeps its conversation here.
                  </EmptyState>
                ) : (
                  <EmptyState title="No sessions here" />
                )}
              </div>
            )}
          </PaneBody>
        </Pane>
      </Drawer>
      <div className={cn('min-w-0 flex-1', open ? 'flex' : 'hidden md:flex')}>
        <Outlet />
      </div>
    </div>
  )
}

function Onboarding({ unpairedName, unpairedUrl }: { unpairedName?: string; unpairedUrl?: string }) {
  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-4 md:items-center">
      <div className="w-full max-w-md">
        {unpairedName && unpairedUrl ? (
          <EmptyState icon={<Server />} title={`Pair this device with ${unpairedName}`}>
            <div className="flex flex-col items-center gap-3">
              <p>
                Run <code className={text({ mono: true })}>muxtower pair</code> on that machine and enter the code.
              </p>
              <PairCodeForm url={unpairedUrl} />
            </div>
          </EmptyState>
        ) : (
          <EmptyState icon={<Server />} title="No daemons yet">
            Run <code className={text({ mono: true })}>muxtower pair</code> on the machine where your agents run, then{' '}
            <Link to="/daemons" className={text({ tone: 'accent', underline: true })}>
              add it here
            </Link>
            .
          </EmptyState>
        )}
      </div>
    </div>
  )
}
