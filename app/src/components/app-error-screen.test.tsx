import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppErrorScreen, retryOnce } from './app-error-screen'

vi.mock('@/lib/error-report', () => ({ reportError: vi.fn() }))

describe('AppErrorScreen', () => {
  it('says something went wrong, with the message small and Reload, and reports it', async () => {
    const { reportError } = await import('@/lib/error-report')
    render(<AppErrorScreen error={new TypeError("Cannot read properties of undefined (reading 'length')")} retry={() => false} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByText(/reading 'length'/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(reportError).toHaveBeenCalledWith('render', expect.any(TypeError))
  })
})

describe('retryOnce', () => {
  it('reloads once, then not again within a minute: it can never loop', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as Storage
    expect(retryOnce(storage, 1_000_000)).toBe(true)
    expect(retryOnce(storage, 1_030_000)).toBe(false)
    expect(retryOnce(storage, 1_061_000)).toBe(true)
    expect(retryOnce(null)).toBe(false) // nowhere to count: never
  })
})
