import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { DictionaryQuickAdd, DictionarySettings } from './dictionary'

type Body = { words: string[]; corrections: { heard: string; write: string }[] }

function hub(start: Body, words_in_prompt?: number) {
  let current = start
  const puts: Body[] = []
  server.use(
    http.get(`${DAEMON_URL}/v1/asr/dictionary`, () =>
      HttpResponse.json({
        ...current,
        fit: { words_in_prompt: words_in_prompt ?? current.words.length, words: current.words.length, tokens: 30, budget: 224 },
      }),
    ),
    http.put(`${DAEMON_URL}/v1/asr/dictionary`, async ({ request }) => {
      current = (await request.json()) as Body
      puts.push(current)
      return HttpResponse.json({
        ...current,
        fit: { words_in_prompt: current.words.length, words: current.words.length, tokens: 30, budget: 224 },
      })
    }),
  )
  return puts
}

it('lists the words and corrections, adds and removes them, saving the whole dictionary each time', async () => {
  const puts = hub({ words: ['acme-cli'], corrections: [{ heard: 'zorbit', write: 'Zorbit' }] })
  const { id } = addDaemon('good')
  render(<DictionarySettings daemonId={id} />, { wrapper: wrapper() })
  const words = await screen.findByRole('region', { name: 'Words' })
  expect(within(words).getByText('acme-cli')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('New word'), { target: { value: 'quuxdb' } })
  fireEvent.click(within(words).getByRole('button', { name: /Add/ }))
  await waitFor(() => expect(puts.at(-1)?.words).toEqual(['acme-cli', 'quuxdb']))
  const corrections = screen.getByRole('region', { name: 'Corrections' })
  fireEvent.change(screen.getByLabelText('New heard'), { target: { value: 'mux tower' } })
  fireEvent.change(screen.getByLabelText('New write'), { target: { value: 'muxtower' } })
  fireEvent.click(within(corrections).getAllByRole('button', { name: /Add/ }).at(-1)!)
  await waitFor(() =>
    expect(puts.at(-1)?.corrections).toEqual([
      { heard: 'zorbit', write: 'Zorbit' },
      { heard: 'mux tower', write: 'muxtower' },
    ]),
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Remove acme-cli' }))
  await waitFor(() => expect(puts.at(-1)?.words).toEqual(['quuxdb']))
})

it('says when not every word fits in what speech to text reads', async () => {
  hub({ words: ['w1', 'w2', 'w3'], corrections: [] }, 2)
  const { id } = addDaemon('good')
  render(<DictionarySettings daemonId={id} />, { wrapper: wrapper() })
  expect(await screen.findByText(/Only the first 2 of 3 words fit/)).toBeInTheDocument()
})

it('quick add: the word as selected, and what it is heard as becomes a correction to it', async () => {
  const puts = hub({ words: [], corrections: [] })
  const { id } = addDaemon('good')
  let closed = false
  render(<DictionaryQuickAdd daemonId={id} word=" Zorbit " onClose={() => (closed = true)} />, { wrapper: wrapper() })
  const form = await screen.findByRole('form', { name: 'Add to dictionary' })
  expect(within(form).getByLabelText('Word')).toHaveValue('Zorbit')
  fireEvent.change(within(form).getByLabelText(/Often heard as/), { target: { value: 'zor bit' } })
  await waitFor(() => expect(within(form).getByRole('button', { name: 'Save' })).toBeEnabled())
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(puts.at(-1)).toEqual({ words: ['Zorbit'], corrections: [{ heard: 'zor bit', write: 'Zorbit' }] }))
  await waitFor(() => expect(closed).toBe(true))
})
