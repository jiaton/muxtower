import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import { daemonKey } from '@/lib/query'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useProjectActivity, useUpdateTeam } from './use-team'

const wrap = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
const lead = { id: 'lead', name: 'billing lead', cwd: '/home/dev/code/billing', state: 'idle', project: 'acme/billing' } as Session

it('sends only what changed, and puts the saved session in the list at once', async () => {
  const daemon = addDaemon()
  let body: unknown
  server.use(
    http.put(`${DAEMON_URL}/v1/sessions/lead/team`, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ ...lead, team_role: 'tech lead' })
    }),
  )
  const client = new QueryClient()
  client.setQueryData(daemonKey(daemon.id, 'sessions'), [lead])
  const { result } = renderHook(() => useUpdateTeam(daemon.id, 'lead'), { wrapper: wrap(client) })
  act(() => result.current.mutate({ role: 'tech lead', rename_project: false }))
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(body).toEqual({ role: 'tech lead', rename_project: false })
  expect(client.getQueryData<Session[]>(daemonKey(daemon.id, 'sessions'))?.[0]?.team_role).toBe('tech lead')
})

it("reads a project's activity over the hours asked, and nothing without a project", async () => {
  const daemon = addDaemon()
  const asked: string[] = []
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions`, () => HttpResponse.json([lead])),
    http.get(`${DAEMON_URL}/v1/projects/:project/activity`, ({ request, params }) => {
      asked.push(`${String(params.project)} ${new URL(request.url).searchParams.get('hours')}`)
      return HttpResponse.json({ project: params.project, members: ['lead'], messages: [], tasks: [] })
    }),
  )
  const { result } = renderHook(
    () => [useProjectActivity(daemon.id, 'acme/billing', 168), useProjectActivity(daemon.id, null, 24)] as const,
    {
      wrapper: wrap(new QueryClient()),
    },
  )
  await waitFor(() => expect(result.current[0].data?.members).toEqual(['lead']))
  expect(new Set(asked)).toEqual(new Set(['acme/billing 168'])) // asked again as the sessions arrive
  expect(result.current[1].fetchStatus).toBe('idle')
})
