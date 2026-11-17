import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setLiveOps, setLiveTarget, useLive } from '../live/engine'
import type { BoxOps } from '../live/pipeline'
import { LiveButton } from './live'

// jsdom is no Mac: Ctrl+Enter is the key (⌘↵ on a Mac).
const sent: string[] = []
const ops: BoxOps = { append: () => {}, clear: () => {}, undo: () => false, send: (t) => (sent.push(t.sessionId), 'sent') }
const flush = () => new Promise((r) => setTimeout(r, 0))
const press = (at: Element = document.body, more: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(at, { code: 'Enter', key: 'Enter', ctrlKey: true, ...more })

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  sent.length = 0
  setLiveOps(ops)
  setLiveTarget({ daemonId: 'd', sessionId: 's1' })
  useLive.setState({ phase: 'listening' })
})
afterEach(() => {
  useLive.setState({ phase: 'off', speaking: false, pending: 0, error: null, commands: { state: 'off' }, heard: null })
  document.body.innerHTML = ''
})

it('sends from anywhere on the page while Live is on, focus outside the box', async () => {
  render(<LiveButton />)
  press()
  await flush()
  expect(sent).toEqual(['s1'])
})

it('in the message box it is simply send; never with Shift or Alt', async () => {
  render(
    <>
      <LiveButton />
      <textarea aria-label="Message the agent" />
    </>,
  )
  const box = document.querySelector('textarea')!
  box.focus()
  press(box, { shiftKey: true })
  press(box, { altKey: true })
  await flush()
  expect(sent).toEqual([])
  press(box)
  await flush()
  expect(sent).toEqual(['s1'])
})

it('is left to another field, and to an open dialog', async () => {
  render(
    <>
      <LiveButton />
      <input aria-label="Session name" />
    </>,
  )
  const field = document.querySelector('input')!
  field.focus()
  press(field)
  await flush()
  expect(sent).toEqual([]) // a rename's own Enter, not Live's
  field.blur()
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  document.body.append(dialog)
  press()
  await flush()
  expect(sent).toEqual([])
})

it('does nothing with Live off', async () => {
  useLive.setState({ phase: 'off' })
  render(<LiveButton />)
  press()
  await flush()
  expect(sent).toEqual([])
})
