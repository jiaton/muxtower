import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { checkRenderer, countInput, resetDiagnostics } from '@/lib/diagnostics'
import { useDismissedAlerts } from '@/lib/dismissed-alerts'
import { WebUsageMark } from './web-usage-mark'

beforeEach(() => {
  resetDiagnostics()
  useDismissedAlerts.setState({ keys: [] })
})

it('says nothing by the app’s name for slow keys: those are for Daemons › Diagnostics', () => {
  for (let i = 0; i < 6; i++) countInput(450, Date.now(), { type: 'keydown', target: 'the message box', id: i + 1, work: 400 })
  render(<WebUsageMark />)
  expect(screen.queryByRole('button')).toBeNull()
})

it('shows what is severe and fixed by an action, until dismissed for that condition', async () => {
  checkRenderer('Google SwiftShader')
  const { rerender } = render(<WebUsageMark />)
  const mark = screen.getByRole('button', { name: /^This app: The browser lost GPU acceleration/ })
  fireEvent.pointerDown(mark, { button: 0, pointerType: 'mouse' })
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Dismiss' }))
  expect(useDismissedAlerts.getState().keys).toEqual(['gpu:Google SwiftShader'])
  act(() => rerender(<WebUsageMark />))
  expect(screen.queryByRole('button', { name: /^This app/ })).toBeNull()
})
