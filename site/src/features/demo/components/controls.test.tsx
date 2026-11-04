import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BEATS } from '../model/script'
import { Controls } from './controls'

const player = (t = 0, playing = false) => ({ t, playing, play: vi.fn(), pause: vi.fn(), seek: vi.fn() })

describe('Controls', () => {
  it('names the current beat and says it in one sentence', () => {
    render(<Controls player={player(BEATS[2].start)} />)
    expect(screen.getByRole('button', { name: BEATS[2].title })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText(/Reply to the exact message/)).toBeInTheDocument()
  })

  it('plays, pauses, restarts and jumps', async () => {
    const paused = player()
    const { rerender } = render(<Controls player={paused} />)
    await userEvent.click(screen.getByRole('button', { name: 'Play the demo' }))
    expect(paused.play).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Forks' }))
    expect(paused.seek).toHaveBeenCalledWith(BEATS.find((b) => b.id === 'forks')!.start)
    const playing = player(9000, true)
    rerender(<Controls player={playing} />)
    await userEvent.click(screen.getByRole('button', { name: 'Pause the demo' }))
    expect(playing.pause).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Start the demo again' }))
    expect(playing.seek).toHaveBeenCalledWith(0)
  })
})
