import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it } from 'vitest'
import { APP_VERSION, useAppUpdate } from '@/lib/app-update'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { AppUpdateBanner } from './app-update-banner'

afterEach(() => useAppUpdate.setState({ ready: false }))

function show(version: string | null) {
  server.use(
    http.get(`${DAEMON_URL}/v1/me`, () =>
      HttpResponse.json({ token_name: 'phone', daemon_name: 'box', features: { summaries: false, asr: false }, version }),
    ),
  )
  addDaemon()
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <AppUpdateBanner />
    </Wrapper>,
  )
}

it('says so when a daemon runs a newer muxtower than this page', async () => {
  show('99.0.0')
  expect(await screen.findByText(/box runs muxtower 99\.0\.0/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
})

it('says nothing for a daemon on the same version, or one too old to say', async () => {
  show(APP_VERSION)
  await new Promise((r) => setTimeout(r, 50))
  expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull()
})

it('says a new version is available once one took over', () => {
  useAppUpdate.setState({ ready: true })
  show(null)
  expect(screen.getByText('A new version is available.')).toBeInTheDocument()
})
