import { describe, expect, it } from 'vitest'
import { chooseLanguages, chosenLanguages, commandOf, keywordsFor } from './kws'

describe('voice commands', () => {
  it('listens for the chosen languages: English by default, per browser', () => {
    localStorage.clear()
    expect(chosenLanguages()).toEqual(['en'])
    chooseLanguages(['en', 'zh'])
    expect(chosenLanguages()).toEqual(['en', 'zh'])
    chooseLanguages([])
    expect(chosenLanguages()).toEqual(['en'])
    const labels = keywordsFor(['zh']).map((k) => k.label)
    expect(labels).toContain('send:zh')
    expect(labels).not.toContain('send:en')
    const send = keywordsFor(['en']).find((k) => k.label === 'send:en')!
    expect(send.matches[0]!.tokens).toEqual(['S', 'EH1', 'N', 'D'])
    expect(send.threshold).toBeGreaterThan(0.25) // stricter: a wrong send is worse than a missed one
  })

  it('a command only when it is sure: one command, no decoy', () => {
    expect(commandOf(['send:en'])).toBe('send')
    expect(commandOf(['pause:zh', 'pause:en'])).toBe('pause')
    expect(commandOf([])).toBeNull()
    expect(commandOf(['send:en', '~en0'])).toBeNull() // "spend" heard too
    expect(commandOf(['send:en', 'pause:en'])).toBeNull()
  })
})
