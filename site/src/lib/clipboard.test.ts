import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

describe('copyText', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the clipboard API', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await copyText('x')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('x')
  })

  it('falls back to a hidden textarea', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('denied')) } })
    document.execCommand = vi.fn(() => true)
    expect(await copyText('y')).toBe(true)
    expect(document.querySelector('textarea')).toBeNull()
  })
})
