import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { useDaemonsStore } from '@/lib/daemons/store'
import { wrapper } from '@/test/render'
import { server } from '@/test/server'
import { useAllSessions } from './use-sessions'

const session = (id: string, needs_attention: boolean) => ({ id, name: id, needs_attention, state: needs_attention ? 'needs_answer' : 'idle' })

it('merges every daemon and keeps going when one is down', async () => {
  useDaemonsStore.setState({ daemons: [] })
  const { add } = useDaemonsStore.getState()
  add({ name: 'a', url: 'http://a.test', token: 't' })
  add({ name: 'b', url: 'http://b.test', token: 't' })
  add({ name: 'unpaired', url: 'http://c.test', token: null })
  server.use(
    http.get('http://a.test/v1/sessions', () => HttpResponse.json([session('x', true), session('y', false)])),
    http.get('http://b.test/v1/sessions', () => HttpResponse.json({ detail: 'boom' }, { status: 500 })),
  )
  const { result } = renderHook(() => useAllSessions(), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.every((d) => !d.isPending)).toBe(true))
  expect(result.current.map((d) => d.daemon.name)).toEqual(['a', 'b'])
  expect(result.current[0].sessions.map((s) => s.id)).toEqual(['x', 'y'])
  expect(result.current[1].error?.message).toBe('boom')
})
