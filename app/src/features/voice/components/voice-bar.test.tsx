import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Dictation } from '../hooks/use-dictation'
import { VoiceBar } from './voice-bar'

const dictation = (over: Partial<Dictation> = {}): Dictation => ({
  available: true, active: true, transcribing: false, error: null,
  start: vi.fn(), cancel: vi.fn(), finish: vi.fn(), level: () => 0.5, ...over,
}) // prettier-ignore

it('records with a cancel and a done, then says it is transcribing', () => {
  const d = dictation()
  const { rerender } = render(<VoiceBar dictation={d} />)
  expect(screen.getByRole('group', { name: 'Recording' }).textContent).toContain('0:00')
  fireEvent.click(screen.getByRole('button', { name: 'Done: to text' }))
  expect(d.finish).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(d.cancel).toHaveBeenCalled()
  rerender(<VoiceBar dictation={dictation({ transcribing: true })} />)
  expect(screen.getByRole('group', { name: 'Transcribing' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
})
