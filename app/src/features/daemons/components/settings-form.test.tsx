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
    setting('summaries.provider', { section: 'Summaries', label: 'Summarize with', choices: ['off', 'codex'], value: 'codex', source: 'config_file' }),
    setting('summaries.min_chars', { section: 'Summaries', label: 'Longer than', kind: 'number', value: 800, default: 400, source: 'app', applies: 'restart', pending: true }),
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
})
