import { useNavigate } from '@tanstack/react-router'
import type { RefObject } from 'react'
import { projectChips, type ChipGroup } from '../model/chip-groups'
import { stepChip } from '../model/chip-switch'
import type { SessionEntry } from '../model/facets'
import { scopeSearch, type ListSearch } from '../model/search'
import { useChipStepping } from './use-chip-keys'

/**
 * Switching the second row's chip from the list: a sideways wheel over `listRef` or `[` / `]` steps to the
 * chip before or after in the row's order (no chip first, no wrapping), choosing it as a click on it does.
 */
export function useChipSwitch(
  listRef: RefObject<HTMLElement | null>,
  { search, entries, groups, projectOrder }: { search: ListSearch; entries: SessionEntry[]; groups: ChipGroup[]; projectOrder: string[] },
) {
  const navigate = useNavigate()
  const ids = (projectChips(groups, entries, projectOrder) ?? []).map((c) => c.id)
  useChipStepping(listRef, (by) => {
    const next = stepChip(ids, search.chip, by)
    if (next !== null) void navigate({ to: '/', search: scopeSearch(search, { chip: next }) })
  })
}
