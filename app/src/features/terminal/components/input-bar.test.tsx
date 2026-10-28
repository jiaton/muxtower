import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDrafts } from '../store'
import { InputBar } from './input-bar'

const mutate = vi.fn((_body: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.())
vi.mock('../api/use-terminal', () => ({ useSendInput: () => ({ mutate, isPending: false, isError: false }) }))

beforeEach(() => {
  mutate.mockClear()
  useDrafts.setState({ drafts: {}, quotes: {} })
})

describe('InputBar', () => {
  it('keeps quotes above the box, apart from what is typed, and sends them first', () => {
    useDrafts.getState().addQuote('nas/s1', 'Pick a date')
    useDrafts.getState().addQuote('nas/s1', 'Or 11/4')
    render(<InputBar daemonId="nas" sessionId="s1" />)
    expect(screen.getByRole('list', { name: 'Quoted' }).textContent).toContain('Pick a date')
    expect(screen.getByRole('textbox', { name: 'Message the agent' })).toHaveValue('') // the box is for typing
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove quote' })[1]!)
    fireEvent.change(screen.getByRole('textbox', { name: 'Message the agent' }), { target: { value: '11/9 works' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(mutate.mock.calls[0]![0]).toEqual({ text: '> Pick a date\n\n11/9 works', enter: true })
    expect(useDrafts.getState()).toMatchObject({ drafts: {}, quotes: {} }) // sent: both go
  })
})
