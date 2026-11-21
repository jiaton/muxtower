import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { daemonKey } from '@/lib/query'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useProjectColours, useProjectHue, useSaveProjectColour } from './use-project-colours'

const wrap = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

it("reads each project's hue from the first daemon (the hub)", async () => {
  addDaemon()
  server.use(http.get(`${DAEMON_URL}/v1/project-colours`, () => HttpResponse.json({ hues: { 'acme/web': 3, 'acme/api': 1 } })))
  const client = new QueryClient()
  const { result } = renderHook(
    () => [useProjectColours(), useProjectHue('acme/web'), useProjectHue('acme/new'), useProjectHue(null)] as const,
    {
      wrapper: wrap(client),
    },
  )
  await waitFor(() => expect(result.current[0]).toEqual({ 'acme/web': 3, 'acme/api': 1 }))
  expect(result.current[1]).toBe(3)
  expect(result.current[2]).toBeNull() // none stored yet: neutral, never a guess
  expect(result.current[3]).toBeNull()
})

it.each([404, 502, 503])('has none from a hub too old to keep them (%i): every project neutral', async (status) => {
  addDaemon()
  let asked = 0
  server.use(
    http.get(`${DAEMON_URL}/v1/project-colours`, () => {
      asked++
      return new HttpResponse(null, { status })
    }),
  )
  const { result } = renderHook(() => [useProjectColours(), useProjectHue('acme/web')] as const, { wrapper: wrap(new QueryClient()) })
  await waitFor(() => expect(asked).toBe(1))
  await new Promise((r) => setTimeout(r, 20))
  expect(result.current).toEqual([{}, null])
  expect(asked).toBe(1) // not asked again at once
})

it('gives a project the picked hue, shown at once, and puts it back when refused', async () => {
  const daemon = addDaemon()
  const bodies: unknown[] = []
  let refuse = false
  server.use(
    http.put(`${DAEMON_URL}/v1/project-colours`, async ({ request }) => {
      const body = (await request.json()) as { project: string; hue: number }
      bodies.push(body)
      return refuse ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({ hues: { 'acme/api': 1, [body.project]: body.hue } })
    }),
  )
  const client = new QueryClient()
  const key = daemonKey(daemon.id, 'project-colours')
  client.setQueryData(key, { 'acme/web': 2, 'acme/api': 1 })
  const { result } = renderHook(() => useSaveProjectColour(), { wrapper: wrap(client) })

  result.current.mutate({ project: 'acme/web', hue: 5 })
  await waitFor(() => expect(client.getQueryData(key)).toEqual({ 'acme/web': 5, 'acme/api': 1 }))
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(bodies).toEqual([{ project: 'acme/web', hue: 5 }])

  refuse = true
  result.current.mutate({ project: 'acme/web', hue: 6 })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(client.getQueryData(key)).toEqual({ 'acme/web': 5, 'acme/api': 1 })
})
