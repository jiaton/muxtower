import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { beforeEach, expect, it } from 'vitest'
import { wrapper } from '@/test/render'
import type { PlanUsage } from '@/lib/api/types'
import { useIsland, usePlanUsagePrefs } from '../store'
import { claude, codex, fakeHub, minutes, win } from '../test/hub'
import { PlanUsageChip } from './plan-usage-chip'

beforeEach(() => {
  usePlanUsagePrefs.setState({ threshold: 80, seen: [] })
  useIsland.setState({ shown: null })
})

function renderChip(usage: PlanUsage, density: 'full' | 'compact' = 'full') {
  fakeHub(usage)
  const Wrapper = wrapper()
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <PlanUsageChip density={density} /> }),
    history: createMemoryHistory(),
  })
  return render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
}

const chip = () => screen.findByRole('button', { name: 'Plan usage' })

it('shows each account its fullest window, live, where the sidebar is narrow', async () => {
  renderChip({ enabled: true, accounts: [claude(), codex()] })
  const text = (await chip()).textContent
  expect(text).toMatch(/^Claudewk 68%\u2009·\u20092dCodexwk 31%\u2009·\u20094d$/)
})

it('in a header, the account nearest a limit, its warning in the tone', async () => {
  renderChip({ enabled: true, accounts: [claude(), codex({ windows: [win('session', 86, 30), win('weekly', 31, 5000)] })] }, 'compact')
  const it = await chip()
  expect(it).toHaveTextContent(/^Codex5h 86% · 30m$/) // whitespace collapsed, the thin spaces too
})

it('says a limit and for how long', async () => {
  renderChip({ enabled: true, accounts: [claude({ limited_until: minutes(72), windows: [win('session', 100, 72)] })] })
  expect(await chip()).toHaveTextContent('Claudelimited · 1h12m')
})

it('shows nothing while off, or with no account', async () => {
  const { unmount } = renderChip({ enabled: false, accounts: [claude()] })
  await waitFor(() => expect(screen.queryByText(/Claude/)).toBeNull())
  unmount()
  renderChip({ enabled: true, accounts: [] })
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Plan usage' })).toBeNull())
})

it('opens every window with its exact reset, and a figure it does not have as "—"', async () => {
  renderChip({ enabled: true, accounts: [claude(), codex({ observed_at: minutes(-12) })] })
  fireEvent.click(await chip())
  const details = await screen.findByRole('dialog', { name: 'Plan usage' })
  const max = within(details).getByRole('region', { name: 'Claude' })
  expect(within(max).getByRole('meter', { name: '5-hour session' })).toHaveAttribute('aria-valuenow', '44')
  expect(within(max).getByText(/^Resets \d\d:\d\d · in 2h 10m$/)).toBeInTheDocument()
  expect(within(max).getByRole('meter', { name: 'Week, Sonnet' })).not.toHaveAttribute('aria-valuenow')
  expect(within(max).getByText('—')).toBeInTheDocument()
  expect(within(details).getByText('As of 12 min ago')).toBeInTheDocument()
  expect(within(details).getByRole('link', { name: 'Plan usage settings' })).toHaveAttribute('href', '/daemons#plan-usage')
})
