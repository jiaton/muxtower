import { act, renderHook } from '@testing-library/react'
import type { MouseEvent } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import type { ChipGroup } from '../model/chip-groups'
import type { SessionEntry } from '../model/facets'
import type { ListSearch } from '../model/search'
import { useChipMemory, useChipSwitchPrefs, useListPrefs } from '../store'
import { useChipSwitch } from './use-chip-switch'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
const entry = (id: string, project: string, minute: number): SessionEntry => ({
  key: `d1/${id}`,
  daemon,
  session: {
    id, name: id, runtime: 'claude-code', cwd: `/home/me/projects/${project}`, source: 'adopted', machine: 'hub', project,
    project_source: 'set', state: 'idle', needs_attention: false, updated_at: new Date(Date.UTC(2026, 10, 5, 10, minute)).toISOString(),
  } as Session, // prettier-ignore
})
const entries = [entry('web-1', 'web', 1), entry('web-2', 'web', 2), entry('api-1', 'api', 3), entry('api-2', 'api', 4)]
const groups: ChipGroup[] = [
  { id: 'a', name: 'A', projects: ['web'], sessions: [] },
  { id: 'b', name: 'B', projects: ['api'], sessions: [] },
]

interface Props {
  search: ListSearch
  open?: { sessionId: string; listed?: boolean }
  beside?: boolean
}

function setup(initial: Props) {
  const list = document.createElement('div')
  document.body.append(list)
  const hook = renderHook(
    ({ search, open, beside = true }: Props) =>
      useChipSwitch(
        { current: list },
        {
          search,
          entries,
          groups,
          projectOrder: [],
          open: open ? { daemonId: 'd1', sessionId: open.sessionId, listed: open.listed ?? true } : undefined,
          beside,
        },
      ),
    { initialProps: initial },
  )
  return { list, hook }
}

const click = () => ({ defaultPrevented: false, button: 0, preventDefault: vi.fn() }) as unknown as MouseEvent
const key = (k: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
const opened = (sessionId: string, chip?: string) => ({
  to: '/d/$daemonId/s/$sessionId',
  params: { daemonId: 'd1', sessionId },
  search: expect.objectContaining({ chip }),
})

describe('useChipSwitch', () => {
  beforeEach(() => {
    navigate.mockClear()
    act(() => {
      useChipMemory.setState({ last: {} })
      useChipSwitchPrefs.setState({ wheel: true })
      useListPrefs.setState({ group: 'project' })
    })
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('remembers the session opened under a chip, only one listed there', () => {
    const { hook } = setup({ search: { chip: 'a' }, open: { sessionId: 'web-2' } })
    expect(useChipMemory.getState().last.a).toEqual({ daemonId: 'd1', sessionId: 'web-2' })
    hook.rerender({ search: { chip: 'a' }, open: { sessionId: 'api-1', listed: false } }) // ⌘K: not in the chip
    expect(useChipMemory.getState().last.a).toEqual({ daemonId: 'd1', sessionId: 'web-2' })
  })

  it('remembers for no chip ("All") too, and opens it again', () => {
    const { hook } = setup({ search: {}, open: { sessionId: 'api-2' } })
    expect(useChipMemory.getState().last['']).toEqual({ daemonId: 'd1', sessionId: 'api-2' })
    hook.rerender({ search: { chip: 'a' }, open: { sessionId: 'web-1' } })
    act(() => void key('['))
    expect(navigate).toHaveBeenLastCalledWith(opened('api-2', undefined))
  })

  it('a click on a chip opens its remembered session instead of the link', () => {
    act(() => useChipMemory.getState().remember('a', { daemonId: 'd1', sessionId: 'web-2' }))
    const { hook } = setup({ search: { chip: 'b' }, open: { sessionId: 'api-1' } })
    const event = click()
    act(() => hook.result.current(event, 'a'))
    expect(event.preventDefault).toHaveBeenCalled()
    expect(navigate).toHaveBeenLastCalledWith(opened('web-2', 'a'))
  })

  it('a click with a modifier, or one already taken (a drop), stays the link’s', () => {
    const { hook } = setup({ search: {} })
    hook.result.current({ ...click(), metaKey: true } as unknown as MouseEvent, 'a')
    hook.result.current({ ...click(), defaultPrevented: true } as unknown as MouseEvent, 'a')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('the wheel and ] open the next chip’s remembered session', () => {
    act(() => useChipMemory.getState().remember('b', { daemonId: 'd1', sessionId: 'api-2' }))
    const { list, hook } = setup({ search: { chip: 'a' } })
    act(() => void list.dispatchEvent(new WheelEvent('wheel', { deltaX: 120, bubbles: true })))
    expect(navigate).toHaveBeenLastCalledWith(opened('api-2', 'b'))
    navigate.mockClear()
    hook.rerender({ search: {} })
    act(() => void key(']'))
    expect(navigate).toHaveBeenLastCalledWith(opened(expect.stringMatching(/^web-/) as unknown as string, 'a')) // nothing kept: its first
  })

  it('opens the chip’s first session when the remembered one is gone', () => {
    act(() => useChipMemory.getState().remember('b', { daemonId: 'd1', sessionId: 'deleted' }))
    setup({ search: { chip: 'a' } })
    act(() => void key(']'))
    expect(navigate).toHaveBeenLastCalledWith(opened(expect.stringMatching(/^api-/) as unknown as string, 'b'))
  })

  it('remembers for this visit when the browser refuses storage', () => {
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      setup({ search: { chip: 'b' }, open: { sessionId: 'api-2' } })
      expect(refuse).toHaveBeenCalled()
      expect(useChipMemory.getState().last.b).toEqual({ daemonId: 'd1', sessionId: 'api-2' })
    } finally {
      refuse.mockRestore()
    }
  })

  it('on a phone (no session beside the list) stays on the list', () => {
    act(() => useChipMemory.getState().remember('a', { daemonId: 'd1', sessionId: 'web-2' }))
    const { hook } = setup({ search: {}, beside: false })
    act(() => void key(']'))
    expect(navigate).toHaveBeenLastCalledWith({ to: '/', search: expect.objectContaining({ chip: 'a' }) })
    act(() => hook.result.current(click(), ''))
    expect(navigate).toHaveBeenLastCalledWith({ to: '/', search: expect.objectContaining({ chip: undefined }) })
  })
})
