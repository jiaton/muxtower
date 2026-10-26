import { Link, Outlet, createFileRoute, useMatch } from '@tanstack/react-router'
import { Archive, BellOff, CheckCheck, EyeOff, Plus, SearchX, Server } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Pane, PaneBody, PaneHeader } from '@/components/ui/pane'
import { QuickApproval } from '@/features/approval/components/quick-approval'
import { PairCodeForm } from '@/features/pairing/components/pair-code-form'
import { DaemonAlerts } from '@/features/sessions/components/daemon-alerts'
import { FilterMenu, ListMenu, ScopeChip, SearchField, ViewTabs } from '@/features/sessions/components/list-controls'
import { NewSessionDialog } from '@/features/sessions/components/new-session-dialog'
import { SessionList } from '@/features/sessions/components/session-list'
import { useOpenedHere } from '@/features/sessions/hooks/use-opened-here'
import { useScrollMemory } from '@/features/sessions/hooks/use-scroll-memory'
import { useSessionEntries } from '@/features/sessions/hooks/use-session-entries'
import { entryKey, folderName, isAssistant } from '@/features/sessions/model/facets'
import { keptEntries, keptGroups } from '@/features/sessions/model/kept'
import { facetsOf, filterEntries, groupEntries, queryTitle } from '@/features/sessions/model/query'
import { parseListSearch, toQuery } from '@/features/sessions/model/search'
import { useListMemory, useListPrefs } from '@/features/sessions/store'
import { cn } from '@/lib/cn'
import { useUnpairedDaemons } from '@/lib/daemons/store'
import { SPLIT_QUERY, useMediaQuery } from '@/lib/use-media-query'

export const Route = createFileRoute('/_sessions')({ validateSearch: parseListSearch, component: SessionsLayout })

/**
 * The session list next to the open session (from `md`), or one of them at a time (phones). The list
 * stays mounted while a session is open, and keeps its scroll position per query.
 */
function SessionsLayout() {
  const search = Route.useSearch()
  const query = toQuery(
    search,
    useListPrefs((s) => s.group),
  )
  const { entries, daemons, loading } = useSessionEntries()
  const unpaired = useUnpairedDaemons()
  const open = useMatch({ from: '/_sessions/d/$daemonId/s/$sessionId', shouldThrow: false })
  const split = useMediaQuery(SPLIT_QUERY)
  const listRef = useRef<HTMLDivElement>(null)
  const listKey = JSON.stringify(query)
  useScrollMemory(listRef, listKey, split || !open, !loading)
  useEffect(() => useListMemory.setState({ lastSearch: search }), [search])

  const visible = filterEntries(entries, query)
  const selectedKey = open ? entryKey(open.params.daemonId, open.params.sessionId) : undefined
  const opened = useOpenedHere(listKey, selectedKey, visible.some((e) => e.key === selectedKey))
  const kept = keptEntries(entries, visible, opened, query)

  if (!daemons.length) return <Onboarding unpairedName={unpaired[0]?.name} unpairedUrl={unpaired[0]?.url} />

  const groups = [...groupEntries(visible, query.group), ...keptGroups(kept)]
  const count = visible.filter((e) => !isAssistant(e.session)).length
  const facets = facetsOf(entries)
  const { title, within } = queryTitle(query)
  const counted = `${count} session${count === 1 ? '' : 's'}`

  return (
    <div className="flex min-w-0 flex-1">
      <Pane
        className={cn('w-full border-r border-border md:w-80 md:shrink-0 xl:w-96', open ? 'hidden md:flex' : 'flex')}
        aria-label="Sessions"
      >
        <PaneHeader
          title={
            <h1 className="truncate" title={title}>
              {query.folder ? folderName(title) : title}
            </h1>
          }
          subtitle={within ? `${within} · ${counted}` : counted}
          actions={
            <>
              <ListMenu query={query} unread={visible.filter((e) => e.session.unread)} />
              <FilterMenu query={query} search={search} facets={facets} className="lg:hidden" />
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
          <ViewTabs query={query} search={search} facets={facets} className="lg:hidden" />
          <ScopeChip query={query} search={search} />
        </PaneHeader>
        <PaneBody ref={listRef}>
          <DaemonAlerts daemons={daemons} />
          {groups.length ? (
            <SessionList
              groups={groups}
              selectedKey={selectedKey}
              foldScope={query.group}
              unfolded={Boolean(query.q?.trim())}
              context={{
                hideDevice: Boolean(query.device),
                hideFolder: Boolean(query.folder),
                hideSource: Boolean(query.source),
                showDaemon: daemons.length > 1,
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
                Run <code className="font-mono">muxtower pair</code> on that machine and enter the code.
              </p>
              <PairCodeForm url={unpairedUrl} />
            </div>
          </EmptyState>
        ) : (
          <EmptyState icon={<Server />} title="No daemons yet">
            Run <code className="font-mono">muxtower pair</code> on the machine where your agents run, then{' '}
            <Link to="/daemons" className="text-accent underline">
              add it here
            </Link>
            .
          </EmptyState>
        )}
      </div>
    </div>
  )
}
