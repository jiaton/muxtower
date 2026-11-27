import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import type { ChipGroup } from '../model/chip-groups'
import { useKeptChipGroups } from './kept-chip-groups'
import { useChipGroupsState } from './use-chip-groups'

const pinned: ChipGroup = { id: 'g1', name: '📌 Launch', projects: ['acme'], sessions: ['s1'] }

beforeEach(() => useKeptChipGroups.setState({ byDaemon: {} }))

it("keeps the hub's answer, and shows it while the hub restarts", async () => {
  server.use(http.get(`${DAEMON_URL}/v1/chip-groups`, () => HttpResponse.json({ groups: [pinned] })))
  const daemon = addDaemon()
  const first = renderHook(() => useChipGroupsState(), { wrapper: wrapper() })
  await waitFor(() => expect(first.result.current).toEqual({ groups: [pinned], known: true }))
  expect(useKeptChipGroups.getState().byDaemon[daemon.id]).toEqual([pinned])
  first.unmount()

  // The app opens again while the hub is down: the groups it last gave, at once.
  server.use(http.get(`${DAEMON_URL}/v1/chip-groups`, () => new Promise<never>(() => {})))
  const again = renderHook(() => useChipGroupsState(), { wrapper: wrapper() })
  expect(again.result.current).toEqual({ groups: [pinned], known: true })
})

it('is not known before the first answer, so the row shows placeholders rather than no groups', async () => {
  server.use(http.get(`${DAEMON_URL}/v1/chip-groups`, () => new Promise<never>(() => {})))
  addDaemon()
  const { result } = renderHook(() => useChipGroupsState(), { wrapper: wrapper() })
  await new Promise((r) => setTimeout(r, 30))
  expect(result.current).toEqual({ groups: [], known: false })
})

it('a daemon too old to keep groups has none, as known', async () => {
  server.use(http.get(`${DAEMON_URL}/v1/chip-groups`, () => new HttpResponse(null, { status: 404 })))
  addDaemon()
  const { result } = renderHook(() => useChipGroupsState(), { wrapper: wrapper() })
  await waitFor(() => expect(result.current).toEqual({ groups: [], known: true }))
})
