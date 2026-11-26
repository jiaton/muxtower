import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { wrapper } from '@/test/render'
import { usePlanUsagePrefs } from '../store'
import { claude, codex, fakeHub, minutes } from '../test/hub'
import { PlanUsageSection } from './plan-usage-section'

beforeEach(() => usePlanUsagePrefs.setState({ threshold: 80, seen: [] }))

const section = () => render(<PlanUsageSection />, { wrapper: wrapper() })

it('lists each account with its key, machines, windows and per-model limits', async () => {
  fakeHub({ enabled: true, accounts: [claude(), codex({ observed_at: minutes(-12) })] })
  section()
  const max = await screen.findByRole('region', { name: 'Claude' })
  expect(within(max).getByText('account a7f3')).toBeInTheDocument()
  expect(within(max).getByText('build-box · mini')).toBeInTheDocument()
  expect(within(max).getByText('Per model')).toBeInTheDocument()
  expect(within(max).getByRole('meter', { name: 'Week, Opus' })).toHaveAttribute('aria-valuenow', '61')
  expect(within(screen.getByRole('region', { name: 'Codex' })).getByText('As of 12 min ago')).toBeInTheDocument()
})

it("turns it off for every machine, on the hub", async () => {
  const hub = fakeHub({ enabled: true, accounts: [claude()] })
  section()
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Show plan usage' }))
  await waitFor(() => expect(hub.settings).toEqual([{ 'plan_usage.enabled': false }]))
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Claude' })).toBeNull())
  expect(screen.getByRole('checkbox', { name: 'Show plan usage' })).not.toBeChecked()
  expect(screen.queryByRole('combobox')).toBeNull()
})

it("keeps this device's threshold", async () => {
  fakeHub({ enabled: true, accounts: [claude()] })
  section()
  fireEvent.change(await screen.findByRole('combobox', { name: /Highlight a window from/ }), { target: { value: '90' } })
  expect(usePlanUsagePrefs.getState().threshold).toBe(90)
})

it('says so when no machine has reported an account', async () => {
  fakeHub({ enabled: true, accounts: [] })
  section()
  expect(await screen.findByText('No machine has reported a signed-in Claude or Codex yet.')).toBeInTheDocument()
})
