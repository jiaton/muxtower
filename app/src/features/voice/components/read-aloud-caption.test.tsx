import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useSpeech } from '../live/speech'
import { ReadAloudCaption } from './read-aloud-caption'

afterEach(() => act(() => useSpeech.setState({ caption: null, captionKept: false })))

it('shows the session, the words with the one being said marked, and n/m while a reply is read', () => {
  useSpeech.setState({ caption: { title: 'web-app', kind: 'summary', pieces: ['修好了。', '等你确认。'], at: 1, done: false } })
  render(<ReadAloudCaption />)
  expect(screen.getByText('web-app')).toBeInTheDocument()
  expect(screen.getByText('等你确认。').className).toMatch(/accent/) // being said
  expect(screen.getByText('修好了。').className).not.toMatch(/accent/)
  act(() => useSpeech.setState({ caption: { title: 'web-app', kind: 'reply', pieces: ['一', '二', '三'], at: 1, done: false } }))
  expect(screen.getByText('2/3')).toBeInTheDocument()
  expect(screen.getByText('二')).toBeInTheDocument()
})

it('a tap keeps it, × or a swipe puts it away', () => {
  useSpeech.setState({ caption: { title: 'api', kind: 'summary', pieces: ['好了。'], at: 0, done: true } })
  render(<ReadAloudCaption />)
  const card = screen.getByRole('status', { name: 'Being read aloud' })
  fireEvent.pointerDown(card, { clientX: 10, clientY: 10 })
  fireEvent.pointerUp(card, { clientX: 12, clientY: 11 })
  expect(useSpeech.getState().captionKept).toBe(true)
  fireEvent.pointerDown(card, { clientX: 10, clientY: 10 })
  fireEvent.pointerUp(card, { clientX: 150, clientY: 12 }) // swiped aside
  expect(useSpeech.getState().caption).toBeNull()
  act(() => useSpeech.setState({ caption: { title: 'api', kind: 'summary', pieces: ['好了。'], at: 0, done: true } }))
  fireEvent.click(screen.getByRole('button', { name: 'Put the caption away' }))
  expect(useSpeech.getState().caption).toBeNull()
})
