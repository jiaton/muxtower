import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useDictionary, useSaveDictionary } from './use-dictionary'

const fit = { words_in_prompt: 1, words: 1, tokens: 40, budget: 224 }

it("reads the hub's dictionary and saves it whole", async () => {
  let saved: unknown
  server.use(
    http.get(`${DAEMON_URL}/v1/asr/dictionary`, () => HttpResponse.json({ words: ['acme-cli'], corrections: [], fit })),
    http.put(`${DAEMON_URL}/v1/asr/dictionary`, async ({ request }) => {
      saved = await request.json()
      return HttpResponse.json({ ...(saved as object), fit: { ...fit, words: 2, words_in_prompt: 2 } })
    }),
  )
  const { id } = addDaemon('good')
  const read = renderHook(() => useDictionary(id), { wrapper: wrapper() })
  await waitFor(() => expect(read.result.current.data?.words).toEqual(['acme-cli']))
  const save = renderHook(() => useSaveDictionary(id), { wrapper: wrapper() })
  await act(async () => {
    await save.result.current.mutateAsync({ words: ['acme-cli', 'Zorbit'], corrections: [{ heard: 'zorbit', write: 'Zorbit' }] })
  })
  expect(saved).toEqual({ words: ['acme-cli', 'Zorbit'], corrections: [{ heard: 'zorbit', write: 'Zorbit' }] })
})
