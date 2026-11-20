import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useLiveAudio } from '../live/audio-prefs'
import { useAudioStatus } from '../live/status'
import { LiveAudioSettings } from './live-audio-settings'

afterEach(() => {
  useLiveAudio.setState({ mic: 'default', processing: true, nextTrack: 'read' })
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
    'Now: Speakerphone (Bluetooth microphone not found: using the default) · voice processing off · media controls held',
  )
})
