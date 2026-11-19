import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { recheckHubVoice } from '../live/hub-voice'
import { stopPlaying } from '../live/play'
import { useSpeech } from '../live/speech'
import { PlayButton, ReadAloudDock } from './play-button'

// The phone's own voice: what it was given; it speaks until told to stop (no end comes by itself).
const said: string[] = []
const cancel = vi.fn()
beforeEach(() => {
  said.length = 0
  cancel.mockClear()
  recheckHubVoice()
  vi.stubGlobal('SpeechSynthesisUtterance', function (this: { text: string }, text: string) {
    this.text = text
  })
  vi.stubGlobal('speechSynthesis', { getVoices: () => [], cancel, speak: (u: { text: string }) => said.push(u.text) })
  server.use(http.get(`${DAEMON_URL}/v1/tts`, () => HttpResponse.json({ available: false, why_not: 'off' })))
})
afterEach(() => {
  act(() => stopPlaying())
  useSpeech.setState({ caption: null, front: null, last: null, asking: null })
  vi.unstubAllGlobals()
})

/** The hub's Play: counts how often it was asked, answers `text` (or refuses with `problem`). */
function hub(session: string, answer: { text: string } | { problem: string; status?: number }) {
  const asked = { n: 0 }
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/${session}/spoken`, () => {
      asked.n += 1
      if ('problem' in answer) return HttpResponse.json({ detail: answer.problem }, { status: answer.status ?? 409 })
      return HttpResponse.json({ at: '2026-11-17T10:00:00Z', text: answer.text, reply: 'r', reply_hash: 'h', language: 'en' })
    }),
  )
  return asked
}

function page(sessionId: string, reply: string | null) {
  const daemon = addDaemon()
  return render(
    <>
      <PlayButton daemonId={daemon.id} sessionId={sessionId} reply={reply} name="web-app" />
      <ReadAloudDock />
    </>,
  )
}

it('shows only once the session has a reply', () => {
  page('none', null)
  expect(screen.queryByRole('button', { name: 'Read the last reply aloud' })).toBeNull()
})

it('a tap asks for the summary once, says it with the caption; a second tap stops', async () => {
  const asked = hub('s1', { text: 'The tests pass.' })
  page('s1', 'All the tests pass now, after the fix.')
  const button = screen.getByRole('button', { name: 'Read the last reply aloud' })
  expect(button).toHaveAttribute('title', expect.stringMatching(/Read the last reply aloud/))
  fireEvent.click(button)
  await waitFor(() => expect(said).toEqual(['The tests pass.']))
  expect(asked.n).toBe(1)
  expect(screen.getByRole('status', { name: 'Being read aloud' })).toHaveTextContent('The tests pass.')
  expect(screen.getByRole('status', { name: 'Being read aloud' })).toHaveTextContent('web-app')
  fireEvent.click(screen.getByRole('button', { name: 'Stop reading' }))
  expect(cancel).toHaveBeenCalled()
  expect(useSpeech.getState().speaking).toBe(false)
  expect(screen.getByRole('button', { name: 'Read the last reply aloud' })).toBeInTheDocument()
})

it('plays the same reply again without asking for a new summary', async () => {
  const asked = hub('s2', { text: 'Deployed.' })
  page('s2', 'Deployed to staging.')
  fireEvent.click(screen.getByRole('button', { name: 'Read the last reply aloud' }))
  await waitFor(() => expect(said).toEqual(['Deployed.']))
  fireEvent.click(screen.getByRole('button', { name: 'Stop reading' }))
  fireEvent.click(screen.getByRole('button', { name: 'Read the last reply aloud' }))
  await waitFor(() => expect(said).toEqual(['Deployed.', 'Deployed.']))
  expect(asked.n).toBe(1)
})

it('asks again once there is a newer reply', async () => {
  const asked = hub('s3', { text: 'Done.' })
  const view = page('s3', 'First reply.')
  fireEvent.click(screen.getByRole('button', { name: 'Read the last reply aloud' }))
  await waitFor(() => expect(asked.n).toBe(1))
  fireEvent.click(screen.getByRole('button', { name: 'Stop reading' }))
  view.rerender(<PlayButton daemonId={useSpeech.getState().front!.daemonId!} sessionId="s3" reply="Second reply." name="web-app" />)
  fireEvent.click(screen.getByRole('button', { name: 'Read the last reply aloud' }))
  await waitFor(() => expect(asked.n).toBe(2))
})

it('stopped while the summary is still coming, says nothing', async () => {
  let answer: () => void = () => undefined
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/s4/spoken`, async () => {
      await new Promise<void>((resolve) => (answer = resolve))
      return HttpResponse.json({ at: '2026-11-17T10:00:00Z', text: 'Late.', reply: 'r', reply_hash: 'h' })
    }),
  )
  page('s4', 'A reply.')
  fireEvent.click(screen.getByRole('button', { name: 'Read the last reply aloud' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Stop reading' })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Stop reading' }))
  answer()
  await new Promise((r) => setTimeout(r, 20))
  expect(said).toEqual([])
})

it.each([
  ['unavailable', 'Fixed the test.', 'No summarizer is set up'],
  ['limit', '测试修好了。', '今天的语音总结已到上限'],
])('says briefly why it cannot (%s), in the language of the reply', async (problem, reply, words) => {
  hub(`e-${problem}`, { problem })
  page(`e-${problem}`, reply)
  fireEvent.click(screen.getByRole('button', { name: 'Read the last reply aloud' }))
  await waitFor(() => expect(said[0]).toBe(words))
  expect(screen.getByRole('status', { name: 'Being read aloud' })).toHaveTextContent(words)
})

it('says the hub could not be reached when it is down', async () => {
  server.use(http.post(`${DAEMON_URL}/v1/sessions/down/spoken`, () => HttpResponse.error()))
  page('down', 'Fixed the test.')
  fireEvent.click(screen.getByRole('button', { name: 'Read the last reply aloud' }))
  await waitFor(() => expect(said).toHaveLength(1))
})

it("speaks in the hub's voice when it has one", async () => {
  const played: string[] = []
  vi.stubGlobal(
    'Audio',
    class {
      onended: (() => void) | null = null
      src: string
      constructor(src: string) {
        this.src = src
      }
      play() {
        played.push(this.src)
        return Promise.resolve()
      }
      pause() {}
    },
  )
  const urls = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
  URL.createObjectURL = () => 'blob:voice'
  URL.revokeObjectURL = () => undefined
  onTestFinished(() => {
    URL.createObjectURL = urls.create
    URL.revokeObjectURL = urls.revoke
  })
  server.use(
    http.get(`${DAEMON_URL}/v1/tts`, () => HttpResponse.json({ available: true })),
    http.post(`${DAEMON_URL}/v1/tts`, () => new HttpResponse(new Blob(['mp3']), { headers: { 'Content-Type': 'audio/mpeg' } })),
  )
  hub('hv', { text: 'Merged.' })
  page('hv', 'Merged the branch.')
  fireEvent.click(screen.getByRole('button', { name: 'Read the last reply aloud' }))
  await waitFor(() => expect(played).toEqual(['blob:voice']))
  expect(said).toEqual([])
})
