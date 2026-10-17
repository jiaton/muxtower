import { describe, expect, it } from 'vitest'
import { buildPairLink, guessDeviceName, parsePairHash, parsePairLink } from './pair-link'

describe('pair links', () => {
  it('reads the single-daemon form printed by the CLI', () => {
    expect(parsePairHash('#u=https%3A%2F%2Fd.example&c=K7QM-3XPA')).toEqual([{ url: 'https://d.example', code: 'K7QM-3XPA' }])
  })

  it('round-trips several daemons, including non-ASCII names', () => {
    const targets = [
      { url: 'https://a.example', code: 'AAAA-AAAA', name: 'build box' },
      { url: 'http://192.168.1.5:8731', code: 'BBBB-BBBB', name: 'résumé' },
    ]
    const link = buildPairLink('https://app.example/', targets)
    expect(link.startsWith('https://app.example/pair#d=')).toBe(true)
    expect(parsePairLink(link)).toEqual(targets)
  })

  it('without an address, pairs with the daemon that serves the page', () => {
    expect(parsePairHash('#c=K7QM-3XPA', 'https://d.example')).toEqual([{ url: 'https://d.example', code: 'K7QM-3XPA' }])
    expect(parsePairHash('#c=K7QM-3XPA')).toEqual([])
  })

  it('ignores garbage', () => {
    expect(parsePairLink('https://example.com/')).toEqual([])
    expect(parsePairHash('#d=@@@')).toEqual([])
  })

  it('names the device from its user agent', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'
    expect(guessDeviceName(iphone)).toBe('iPhone Safari')
  })
})
