import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addDaemon } from '@/test/render'
import { daemonKey } from '@/lib/query'
import type { PlanUsage } from '@/lib/api/types'
import { useIsland, usePlanUsagePrefs } from '../store'
import { claude, codex, minutes, win } from '../test/hub'
import { GROW_AFTER_MS, HOLD_MS, PlanUsageIsland } from './plan-usage-island'

// The island's rules over time, with the hub's reply put straight in the cache (no network under fake
// timers). jsdom has no View Transitions: these run the path Safari before 18 takes.

let client: QueryClient
let key: readonly unknown[]

/** A new reading. The cache tells its observers in a batch of its own (a 0 ms timer): let it through. */
function show(usage: PlanUsage) {
  act(() => client.setQueryData(key, usage))
  act(() => vi.advanceTimersByTime(0))
}

function mount(usage: PlanUsage) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  key = daemonKey(addDaemon().id, 'plan-usage')
  client.setQueryData(key, usage)
  return render(
    <QueryClientProvider client={client}>
      <PlanUsageIsland />
    </QueryClientProvider>,
  )
}

const high = (percent = 82) => ({ enabled: true, accounts: [claude({ windows: [win('session', percent, 65), win('weekly', 71, 3000)] })] })
const island = () => screen.queryByRole('button', { name: /Dismiss$/ })
/** Time passing. React commits what a timer changed when an `act` ends, so a timer the island sets in
 *  answer (grown, it holds; settled, the next grows) starts then: step through one stage at a time. */
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
  usePlanUsagePrefs.setState({ threshold: 80, seen: [] })
  useIsland.setState({ shown: null })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('grows a moment after a window passes the threshold, holds six seconds, and settles', () => {
  expect(document.startViewTransition).toBeUndefined()
  mount(high())
  expect(island()).toBeNull()
  wait(GROW_AFTER_MS)
  expect(island()).toHaveAccessibleName('Claude 5-hour session at 82%. Dismiss')
  expect(screen.getByText('Claude · 5-hour session')).toBeInTheDocument()
  wait(HOLD_MS - 1)
  expect(island()).not.toBeNull()
  wait(1)
  expect(island()).toBeNull()
})

it('grows once for a window while it stays over, also after a reload, and again on its next crossing', () => {
  const { unmount } = mount(high())
  wait(GROW_AFTER_MS)
  wait(HOLD_MS)
  expect(island()).toBeNull()
  show(high(86)) // the next reading: still over
  wait(GROW_AFTER_MS)
  expect(island()).toBeNull()
  unmount()
  mount(high(86)) // a reload: remembered on this device
  wait(GROW_AFTER_MS)
  expect(island()).toBeNull()
  show({ enabled: true, accounts: [claude()] }) // it reset: 44%
  wait(0)
  show(high(81)) // and crossed again
  wait(GROW_AFTER_MS)
  expect(island()).not.toBeNull()
})

it('settles at once when tapped', () => {
  mount(high())
  wait(GROW_AFTER_MS)
  fireEvent.click(island()!)
  expect(island()).toBeNull()
  wait(HOLD_MS)
  expect(island()).toBeNull()
})

it('says a limit, and shows several subjects one after another, most pressing first', () => {
  mount({
    enabled: true,
    accounts: [
      claude({ limited_until: minutes(72), windows: [win('session', 100, 72)] }),
      codex({ windows: [win('session', 85, 30, { label: '5 hours' }), win('weekly', 31, 5000)] }),
    ],
  })
  wait(GROW_AFTER_MS)
  expect(island()?.textContent).toMatch(/^Claude limited until \d\d:\d\d1h 12m left · 5-hour session$/)
  wait(HOLD_MS)
  expect(island()).toBeNull()
  wait(GROW_AFTER_MS)
  expect(island()).toHaveAccessibleName('Codex 5 hours at 85%. Dismiss')
})

it('settles when its subject goes (turned off) and grows nothing while off', () => {
  mount(high())
  wait(GROW_AFTER_MS)
  show({ ...high(), enabled: false })
  wait(0)

  expect(island()).toBeNull()
  expect(useIsland.getState().shown).toBeNull()
})

it('never grows under reduced motion: the chip is the highlight', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  mount(high())
  wait(GROW_AFTER_MS)
  wait(HOLD_MS)
  expect(island()).toBeNull()
  expect(usePlanUsagePrefs.getState().seen).toEqual([])
})
