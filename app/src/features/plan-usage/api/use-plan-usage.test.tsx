import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { wrapper } from '@/test/render'
import { claude, codex, fakeHub } from '../test/hub'
import { usePlanUsage, useSetPlanUsageEnabled } from './use-plan-usage'

function hooks() {
  return renderHook(() => ({ usage: usePlanUsage(), set: useSetPlanUsageEnabled() }), { wrapper: wrapper() })
}

it('reads what the hub reports', async () => {
  fakeHub({ enabled: true, accounts: [claude(), codex()] })
  const { result } = hooks()
  await waitFor(() => expect(result.current.usage.data?.accounts?.map((a) => a.provider)).toEqual(['claude', 'codex']))
})

it('turns it off at once, and keeps what the hub says', async () => {
  const hub = fakeHub({ enabled: true, accounts: [claude()] })
  const { result } = hooks()
  await waitFor(() => expect(result.current.usage.data?.enabled).toBe(true))
  act(() => result.current.set.mutate(false))
  await waitFor(() => expect(result.current.usage.data?.enabled).toBe(false))
  await waitFor(() => expect(result.current.set.isSuccess).toBe(true))
  expect(hub.settings).toEqual([{ 'plan_usage.enabled': false }])
  expect(result.current.usage.data?.enabled).toBe(false)
})

it('puts the switch back when the hub refuses', async () => {
  const hub = fakeHub({ enabled: true, accounts: [claude()] })
  hub.refuse = true
  const { result } = hooks()
  await waitFor(() => expect(result.current.usage.data?.enabled).toBe(true))
  act(() => result.current.set.mutate(false))
  await waitFor(() => expect(result.current.set.isError).toBe(true))
  await waitFor(() => expect(result.current.usage.data?.enabled).toBe(true))
})
