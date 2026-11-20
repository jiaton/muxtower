import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { LayoutSwitch, ShowPanesButton } from './layout-switch'

const options = [
  { value: 'full', label: 'Sidebar, list and session', panes: 3 as const },
  { value: 'list', label: 'List and session', panes: 2 as const },
  { value: 'session', label: 'Session only', panes: 1 as const },
]

it('draws a segment per layout, named, the current one checked; picks another, not the current again', () => {
  const onChange = vi.fn()
  render(<LayoutSwitch value="list" options={options} onChange={onChange} />)
  const group = screen.getByRole('radiogroup', { name: 'Layout' })
  expect(group.querySelectorAll('[role="radio"]')).toHaveLength(3)
  expect(screen.getByRole('radio', { name: 'List and session' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(screen.getByRole('radio', { name: 'List and session' }))
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('radio', { name: 'Session only' }))
  expect(onChange).toHaveBeenCalledWith('session')
})

it('each segment carries its name as a tooltip; compact keeps them all, named', () => {
  render(<LayoutSwitch value="full" options={options.slice(0, 2)} onChange={() => {}} compact />)
  expect(screen.getAllByRole('radio')).toHaveLength(2)
  expect(screen.getByRole('radio', { name: 'Sidebar, list and session' })).toHaveAttribute('title', 'Sidebar, list and session')
  expect(screen.getByRole('radio', { name: 'List and session' })).toHaveAttribute('aria-checked', 'false')
})

it('the panel-left carries a count, else a dot, else nothing', () => {
  const onClick = vi.fn()
  const { rerender, container } = render(<ShowPanesButton label="Show sessions (3 need you)" count={3} alert onClick={onClick} />)
  const button = screen.getByRole('button', { name: 'Show sessions (3 need you)' })
  expect(button).toHaveTextContent('3')
  fireEvent.click(button)
  expect(onClick).toHaveBeenCalledOnce()
  rerender(<ShowPanesButton label="Show the sidebar (a daemon is unreachable)" alert onClick={onClick} />)
  expect(screen.getByRole('button')).toHaveTextContent('')
  expect(container.querySelectorAll('span[aria-hidden]')).toHaveLength(1) // the dot
  rerender(<ShowPanesButton label="Show the sidebar" onClick={onClick} />)
  expect(container.querySelectorAll('span[aria-hidden]')).toHaveLength(0)
})
