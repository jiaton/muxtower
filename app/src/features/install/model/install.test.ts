import { describe, expect, it } from 'vitest'
import { installOption } from './install'

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const base = { standalone: false, canPrompt: false }

describe('installOption', () => {
  it('says nothing once installed', () => {
    expect(installOption({ ...base, standalone: true, canPrompt: true, userAgent: CHROME_ANDROID })).toBeNull()
  })

  it('offers the browser prompt when there is one', () => {
    expect(installOption({ ...base, canPrompt: true, userAgent: DESKTOP })).toBe('prompt')
  })

  it('explains the manual way on iPhone', () => {
    expect(installOption({ ...base, userAgent: IPHONE })).toBe('ios')
  })

  it('tells Chrome from Android browsers that send its user agent', () => {
    expect(installOption({ ...base, userAgent: CHROME_ANDROID, brands: ['Chromium', 'Google Chrome'] })).toBe('menu')
    expect(installOption({ ...base, userAgent: CHROME_ANDROID, brands: ['Chromium', 'Not=A?Brand'] })).toBe('shortcut')
    expect(installOption({ ...base, userAgent: CHROME_ANDROID })).toBe('shortcut') // no userAgentData: Firefox
  })

  it('says nothing on a desktop browser without a prompt', () => {
    expect(installOption({ ...base, userAgent: DESKTOP, brands: ['Chromium'] })).toBeNull()
  })
})
