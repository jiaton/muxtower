import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { MachineSettings, SettingView } from '@/lib/api/types'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { SettingsForm, sectionsOf } from './settings-form'

const setting = (key: string, more: Partial<SettingView>): SettingView => ({
  key, section: 'After a restart', label: key, help: '', kind: 'choice', choices: [], value: null, default: null,
  source: 'default', applies: 'now', pending: false, ...more,
}) // prettier-ignore

const LISTED: MachineSettings = {
  machine: 'box',
  settings: [
    setting('recovery.mode', { label: 'Interrupted sessions', choices: ['ask', 'auto', 'off'], value: 'ask', default: 'ask' }),
    setting('summaries.provider', {
      section: 'Summaries',
      label: 'Summarize with',
      choices: ['off', 'codex'],
      value: 'codex',
      source: 'config_file',
    }),
    setting('summaries.min_chars', {
      section: 'Summaries',
      label: 'Longer than',
      kind: 'number',
      value: 800,
      default: 400,
      source: 'app',
      applies: 'restart',
      pending: true,
    }),
  ],
}

function renderForm() {
  const daemon = addDaemon()
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <SettingsForm daemonId={daemon.id} />
    </Wrapper>,
  )
}

describe('SettingsForm', () => {
  it('keeps the sections in the order the daemon lists them', () => {
    expect(sectionsOf(LISTED.settings).map((s) => [s.section, s.settings.length])).toEqual([
      ['After a restart', 1],
      ['Summaries', 2],
    ])
  })

  it('sends a change as it is made, says what waits for a restart, and leaves the file’s alone', async () => {
    const sent: unknown[] = []
    server.use(
      http.get(`${DAEMON_URL}/v1/settings`, () => HttpResponse.json(LISTED)),
      http.patch(`${DAEMON_URL}/v1/settings`, async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json(LISTED)
      }),
    )
    renderForm()
    expect(await screen.findByText(/Longer than applies when muxtower restarts on box/)).toBeInTheDocument()
    expect(screen.getByText(/Set by the config file/)).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'codex' })).toBeNull() // the file's: shown, not offered
    fireEvent.click(screen.getByRole('radio', { name: 'auto' }))
    fireEvent.click(screen.getByRole('button', { name: /Back to the default for Longer than/ }))
    await waitFor(() => expect(sent).toEqual([{ values: { 'recovery.mode': 'auto' } }, { values: { 'summaries.min_chars': null } }]))
  })

  it('a long list is picked from a list (empty: by language), a prompt is a box with its default shown', async () => {
    const sent: unknown[] = []
    const voices = ['', 'zh-CN-XiaoxiaoNeural', 'en-US-AvaMultilingualNeural', 'a', 'b', 'c']
    const listed: MachineSettings = {
      machine: 'hub',
      settings: [
        setting('tts.voice', { section: 'Read aloud voice', label: 'Voice', choices: voices, value: '', default: '' }),
        setting('listen.prompt', {
          section: 'Summaries', label: 'Prompt', kind: 'multiline', value: 'Say it in {language}.', default: 'Say it in {language}.',
        }),
      ],
    } // prettier-ignore
    server.use(
      http.get(`${DAEMON_URL}/v1/settings`, () => HttpResponse.json(listed)),
      http.patch(`${DAEMON_URL}/v1/settings`, async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json(listed)
      }),
    )
    renderForm()
    const voice = await screen.findByRole('combobox', { name: 'Voice' })
    expect(screen.getByRole('option', { name: 'by language' })).toBeInTheDocument()
    fireEvent.change(voice, { target: { value: 'en-US-AvaMultilingualNeural' } })
    const prompt = screen.getByRole('textbox', { name: 'Prompt' })
    expect(prompt).toHaveAttribute('placeholder', 'Say it in {language}.')
    fireEvent.change(prompt, { target: { value: 'In {language}, one sentence.' } })
    fireEvent.blur(prompt)
    await waitFor(() =>
      expect(sent).toEqual([
        { values: { 'tts.voice': 'en-US-AvaMultilingualNeural' } },
        { values: { 'listen.prompt': 'In {language}, one sentence.' } },
      ]),
    )
  })

  it('a mode per runtime: each from its own list, unset following the default, sent as the whole mapping', async () => {
    const sent: unknown[] = []
    const listed: MachineSettings = {
      machine: 'hub',
      settings: [
        setting('triggers.start_mode', {
          section: 'Triggers', label: 'Start mode', kind: 'per_runtime', value: { 'claude-code': 'auto' },
          default: { 'claude-code': 'auto', codex: 'on-request' }, source: 'app',
          runtime_choices: { 'claude-code': ['default', 'auto'], codex: ['untrusted', 'on-request'] },
        }),
      ],
    } // prettier-ignore
    server.use(
      http.get(`${DAEMON_URL}/v1/settings`, () => HttpResponse.json(listed)),
      http.patch(`${DAEMON_URL}/v1/settings`, async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json(listed)
      }),
    )
    renderForm()
    const claude = await screen.findByRole('combobox', { name: 'Start mode: claude-code' })
    const codex = screen.getByRole('combobox', { name: 'Start mode: codex' })
    expect(claude).toHaveValue('auto')
    expect(codex).toHaveValue('') // not set: the default
    expect([...codex.querySelectorAll('option')].map((o) => o.value)).toEqual(['', 'untrusted', 'on-request'])
    expect(document.getElementById('setting-triggers.start_mode')).toContainElement(claude) // what the trigger editor links to
    fireEvent.change(codex, { target: { value: 'untrusted' } })
    fireEvent.change(claude, { target: { value: '' } })
    await waitFor(() =>
      expect(sent).toEqual([
        { values: { 'triggers.start_mode': { 'claude-code': 'auto', codex: 'untrusted' } } },
        { values: { 'triggers.start_mode': {} } },
      ]),
    )
  })

  it('what goes in a section the daemon does not list still shows, under its own heading', async () => {
    server.use(http.get(`${DAEMON_URL}/v1/settings`, () => HttpResponse.json(LISTED)))
    const daemon = addDaemon()
    const Wrapper = wrapper()
    render(
      <Wrapper>
        <SettingsForm daemonId={daemon.id} extras={{ Triggers: <p>the triggers</p> }} />
      </Wrapper>,
    )
    const section = await screen.findByRole('region', { name: 'Triggers' })
    expect(section).toHaveTextContent('the triggers')
  })
})
