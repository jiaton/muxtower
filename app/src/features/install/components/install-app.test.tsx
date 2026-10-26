import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInstallStore } from '../store'
import { InstallApp } from './install-app'

const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'

function browser(userAgent: string, standalone = false) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: standalone && query.includes('standalone') }))
}

describe('InstallApp', () => {
  beforeEach(() => useInstallStore.setState({ prompt: null, installed: false }))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('installs with the browser prompt in one tap', async () => {
    browser(ANDROID)
    const prompt = vi.fn(async () => {})
    useInstallStore.setState({ prompt: { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) } as never })
    render(<InstallApp />)
    fireEvent.click(screen.getByRole('button', { name: /install app/i }))
    expect(prompt).toHaveBeenCalledOnce()
    expect(await screen.findByText(/installed\. open muxtower/i)).toBeTruthy()
  })

  it('points other Android browsers to Chrome', () => {
    browser(ANDROID)
    render(<InstallApp />)
    expect(screen.getByText(/only as a shortcut/i)).toBeTruthy()
  })

  it('shows nothing when running installed', () => {
    browser(ANDROID, true)
    const { container } = render(<InstallApp />)
    expect(container.textContent).toBe('')
  })
})
