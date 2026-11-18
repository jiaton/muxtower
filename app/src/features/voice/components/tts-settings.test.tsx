import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { TtsSettings } from './tts-settings'

const status = (over: object) => ({
  provider: 'azure', available: false, why_not: 'key', region: 'eastus', voice: 'zh-CN-XiaoxiaoNeural', style: '',
  key_present: false, month: '2026-11', characters: 0, soft_cap: 450000, free_tier: 500000, voices: [], styles: [], ...over,
}) // prettier-ignore

function show(body: object) {
  server.use(http.get(`${DAEMON_URL}/v1/tts`, () => HttpResponse.json(body)))
  const daemon = addDaemon()
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <TtsSettings daemonId={daemon.id} />
    </Wrapper>,
  )
}

it("says the key is missing (never showing a key) and that the phone's voice is used", async () => {
  show(status({}))
  expect(await screen.findByText(/No key, or Azure refused it/)).toBeInTheDocument()
  expect(screen.getByText(/Key file: missing/)).toBeInTheDocument()
  expect(screen.getByText(/450,000 cap · Azure's free tier: 500,000 a month/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Preview/ })).toBeDisabled()
})

it('in use: the voice and style, this month so far, and a preview', async () => {
  show(status({ available: true, why_not: null, key_present: true, characters: 12345, style: 'chat' }))
  expect(await screen.findByText('In use: zh-CN-XiaoxiaoNeural (chat), eastus.')).toBeInTheDocument()
  expect(screen.getByText(/Key file: present · This month \(2026-11\): 12,345 characters/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Preview/ })).toBeEnabled()
})
