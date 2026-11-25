import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, type MouseEvent, type RefObject } from 'react'
import { chipMembers, projectChips, type ChipGroup } from '../model/chip-groups'
import { chipLanding, NO_CHIP, stepChip, type SessionRef } from '../model/chip-switch'
import type { SessionEntry } from '../model/facets'
import { scopeSearch, toQuery, type ListSearch } from '../model/search'
import { useChipMemory, useListPrefs } from '../store'
import { useChipStepping } from './use-chip-keys'

const PENDING_MS = 1000 // a switch not drawn by then is not waited for

/**
 * Switching the second row's chip, and what opens with it. Each chip (and no chip, "All") remembers the
 * session last opened while it was chosen, if it is listed there. Choosing a chip, by a click on it, a
 * sideways wheel over `listRef` or `[` / `]` (the chip before or after in the row's order, no chip first,
 * no wrapping), chooses it as the chip's link does and, where the session shows beside the list (`beside`),
 * opens its remembered session too, as a row's click does; gone, archived or no longer in the chip, its
 * first session in the list's order; none, the empty pane. On a phone (one pane at a time) it stays on the
 * list. Returns what a chip's click calls (`choose`): a click with a modifier stays the link's own.
 * Steps in quick succession (a mouse wheel's notches) go on from the chip the last one chose, even before
 * its page has drawn.
 */
export function useChipSwitch(
  listRef: RefObject<HTMLElement | null>,
  {
    search,
    entries,
    groups,
    projectOrder,
    open,
    beside,
  }: {
    search: ListSearch
    entries: SessionEntry[]
    groups: ChipGroup[]
    projectOrder: string[]
    /** The session open now, and whether the list shows it under the chosen chip. */
    open: (SessionRef & { listed: boolean }) | undefined
    beside: boolean
  },
) {
  const navigate = useNavigate()
  const group = useListPrefs((s) => s.group)
  const remember = useChipMemory((s) => s.remember)
  const chip = search.chip ?? NO_CHIP

  useEffect(() => {
    if (open?.listed) remember(chip, { daemonId: open.daemonId, sessionId: open.sessionId })
  }, [chip, open?.daemonId, open?.sessionId, open?.listed, remember])

  // The chip the last switch chose, and the chip shown when it did: until the page shows another (for a
  // second at most: Back may come to that chip again later), a step goes on from it, not from the one shown.
  const pending = useRef<{ shown: string; next: string; at: number } | null>(null)

  const go = (next: string) => {
    pending.current = { shown: chip, next, at: performance.now() }
    const target = scopeSearch(search, { chip: next })
    const query = { ...toQuery(target, group), chip: chipMembers(next || undefined, groups) ?? undefined }
    const landing = beside ? chipLanding(entries, query, useChipMemory.getState().last[next], projectOrder) : null
    if (landing)
      void navigate({ to: '/d/$daemonId/s/$sessionId', params: { daemonId: landing.daemon.id, sessionId: landing.session.id }, search: target })
    else void navigate({ to: '/', search: target })
  }

  const ids = (projectChips(groups, entries, projectOrder) ?? []).map((c) => c.id)
  useChipStepping(listRef, (by) => {
    const was = pending.current
    const from = was && was.shown === chip && performance.now() - was.at < PENDING_MS ? was.next : chip
    const next = stepChip(ids, from, by)
    if (next !== null) go(next)
  })

  // The same function from render to render (it calls the latest `go`): the chip row it is given is drawn
  // again only when what it shows changed, not on every session opened.
  const latest = useRef(go)
  useEffect(() => {
    latest.current = go
  })
  return useCallback((event: MouseEvent, next: string) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    latest.current(next)
  }, [])
}
