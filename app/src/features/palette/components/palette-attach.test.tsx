import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAttachPickers } from '@/lib/attach-picker'
import type { SessionEntry } from '@/features/sessions/model/facets'
import { wrapper } from '@/test/render'
import { usePalette } from '../store'
import { PaletteHost } from './palette-host'

// A session page in front ("Plan the launch"), without a router or a daemon: what the palette reads of them.
const entry = {
  key: 'box/s1',
  daemon: { id: 'box', name: 'build-box', url: 'http://daemon.test', token: 't' },
  session: {
    id: 's1', name: 'Plan the launch', state: 'idle', updated_at: '2026-01-01T00:00:00Z', unread: false,
    capabilities: { screen: true, conversation: false, images: true, keys: [] },
  },
} as unknown as SessionEntry // prettier-ignore
vi.mock('@tanstack/react-router', async (actual) => ({
  ...(await actual<typeof import('@tanstack/react-router')>()),
  useMatch: (opts?: { select?: (match: unknown) => unknown }) => {
    const match = { params: { daemonId: 'box', sessionId: 's1' } }
    return opts?.select ? opts.select(match) : match
  },
  useNavigate: () => () => undefined,
}))
vi.mock('@/features/sessions/hooks/use-session-entries', () => ({ useSessionEntries: () => ({ entries: [entry] }) }))
vi.mock('@/features/sessions/components/session-actions', () => ({
  SessionActions: ({ children }: { children: (actions: []) => ReactNode }) => children([]),
}))

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
afterEach(() => {
  act(() => usePalette.getState().setOpen(false))
  useAttachPickers.setState({ pickers: {} })
})

const commands = () => screen.queryAllByRole('option').map((o) => o.textContent)

it('offers "Attach a file…" only while the session in front shows a message box, and opens its picker', () => {
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <PaletteHost />
    </Wrapper>,
  )
  act(() => usePalette.getState().setOpen(true))
  act(() => usePalette.getState().setQuery('attach'))
  expect(commands()).not.toContain('Attach a file…') // no message box (an archived session's page)
  const pick = vi.fn()
  act(() => useAttachPickers.getState().set('box/s1', pick))
  expect(commands()).toContain('Attach a file…')
  fireEvent.click(screen.getByRole('option', { name: 'Attach a file…' }))
  expect(pick).toHaveBeenCalledOnce()
  act(() => useAttachPickers.getState().set('box/other', vi.fn())) // another session's box does not count
  act(() => useAttachPickers.getState().set('box/s1', null))
  act(() => usePalette.getState().setOpen(true))
  act(() => usePalette.getState().setQuery('attach'))
  expect(commands()).not.toContain('Attach a file…')
})
