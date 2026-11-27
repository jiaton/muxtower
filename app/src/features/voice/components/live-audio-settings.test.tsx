import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useLiveAudio } from '../live/audio-prefs'
import { useAudioStatus } from '../live/status'
import { useCallRoute } from '../live/call-audio'
import { LiveAudioSettings } from './live-audio-settings'

afterEach(() => {
  useLiveAudio.setState({ mic: 'default', processing: true, nextTrack: 'read', callAudio: true })
  useCallRoute.setState({ open: false })
  useAudioStatus.setState({ input: null, processing: null, note: null, handlers: false, loop: 'off' })
})

it('sets the microphone, voice processing and the car’s ⏭, and says what is in use, as it changes', () => {
  render(<LiveAudioSettings />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Microphone' }), { target: { value: 'bluetooth' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Voice processing' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Send' }))
  expect(useLiveAudio.getState()).toMatchObject({ mic: 'bluetooth', processing: false, nextTrack: 'send' })

  const now = screen.getByRole('status', { name: 'Live audio now' })
  expect(now.textContent).toBe('Now: Live is off · media controls not held')
  act(() =>
    useAudioStatus.setState({
      input: 'Speakerphone',
      processing: false,
      note: 'Bluetooth microphone not found: using the default',
      handlers: true,
      loop: 'playing',
    }),
  )
  expect(now.textContent).toBe(
    'Now: Speakerphone (Bluetooth microphone not found: using the default) · voice processing off · read-aloud as media · media controls held',
  )
})

it('plays read-aloud through the call audio in Live by default, a setting to turn off; the line says which', () => {
  render(<LiveAudioSettings />)
  const setting = screen.getByRole('checkbox', { name: 'In Live, play read-aloud through the call audio' })
  expect(setting).toBeChecked()
  fireEvent.click(setting)
  expect(useLiveAudio.getState().callAudio).toBe(false)
  act(() => {
    useAudioStatus.setState({ input: 'Bluetooth headset', processing: true, note: null, handlers: false, loop: 'off' })
    useCallRoute.setState({ open: true })
  })
  expect(screen.getByRole('status', { name: 'Live audio now' }).textContent).toBe(
    'Now: Bluetooth headset · voice processing on · read-aloud through the call audio · media controls not held',
  )
})
