import 'fake-indexeddb/auto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { logPush, pushRecord } from '@/lib/push-log'
import { PushLogTable } from '../components/push-log-table'
import { usePushLog } from './use-push-log'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)
const SCOPE = 'https://app.example/push/hub-1/'

it('reads the push log kept on this device; the table shows its newest first, by short tag', async () => {
  const { result } = renderHook(() => usePushLog(), { wrapper })
  await waitFor(() => expect(result.current.data).toEqual([]))
  await logPush(pushRecord('show', { kind: 'done', ref: 'hub-1', session: 's1', tag: 'hub-1:s1', scope: SCOPE, version: '' }))
  await logPush(
    pushRecord('clear', { kind: 'clear', ref: 'hub-1', scope: SCOPE, version: '' }, { asked: ['hub-1:s1'], present: [{ tag: 'hub-1:s1', at: 1 }], closed: [], held: ['hub-1:s1'] }, true),
  )
  render(<PushLogTable />, { wrapper })
  const rows = await screen.findAllByRole('row')
  expect(rows).toHaveLength(3)
  expect(rows[1]!.textContent).toContain('clear')
  expect(rows[1]!.textContent).toContain('1: hub-:s1')
  expect(rows[2]!.textContent).toContain('show done')
})
