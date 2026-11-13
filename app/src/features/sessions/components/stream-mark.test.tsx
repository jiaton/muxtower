import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useStreamStatus } from '@/lib/api/streams'
import { StreamMark } from './stream-mark'

afterEach(() => vi.restoreAllMocks())

it('says nothing while updates arrive as they happen, and says why when they do not', () => {
  useStreamStatus.setState({ status: { d1: 'open' } } as never)
  const { container, rerender } = render(<StreamMark daemonId="d1" />)
  expect(container).toBeEmptyDOMElement()

  useStreamStatus.setState({ status: { d1: 'connecting' } } as never)
  rerender(<StreamMark daemonId="d1" />)
  expect(screen.getByRole('img', { name: /Reconnecting/ })).toBeInTheDocument()

  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  render(<StreamMark daemonId="d2" />)
  expect(screen.getByRole('img', { name: /Offline/ })).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /Live/ })).toBeNull()
})
