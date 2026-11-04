import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { RuntimeInfo } from '@/lib/api/types'
import { splitArgs } from '../model/launch'
import { LaunchOptions } from './launch-options'

const claude = {
  name: 'claude-code', binary: 'claude', available: true, has_hooks: true, headless: false, default_mode: 'agent',
  permission_modes: [
    { id: 'plan', label: 'Plan first', dangerous: false },
    { id: 'bypassPermissions', label: 'Bypass permissions', dangerous: true },
  ],
} as RuntimeInfo // prettier-ignore

describe('how a new session starts', () => {
  it('splits extra arguments as a shell would', () => {
    expect(splitArgs('--model opus --append-system-prompt "be brief"')).toEqual(['--model', 'opus', '--append-system-prompt', 'be brief'])
    expect(splitArgs('  ')).toEqual([])
  })

  it('offers the runtime’s own modes, the agent’s default first, and warns of one that asks nothing', () => {
    let chosen: string | null = null
    const { rerender } = render(<LaunchOptions runtime={claude} mode={null} onMode={(m) => (chosen = m)} extra="" onExtra={() => {}} />)
    const select = screen.getByRole('combobox', { name: 'Permission mode' })
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual(['agent', 'plan', 'bypassPermissions'])
    expect(screen.queryByText(/without asking you/)).toBeNull()
    fireEvent.change(select, { target: { value: 'bypassPermissions' } })
    expect(chosen).toBe('bypassPermissions')
    rerender(<LaunchOptions runtime={claude} mode="bypassPermissions" onMode={() => {}} extra="" onExtra={() => {}} />)
    expect(screen.getByText(/without asking you/)).toBeInTheDocument()
  })
})
