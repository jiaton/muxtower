import { describe, expect, it } from 'vitest'
import { blockedBeforeTrying, isPrivate, whyUnreachable, withScheme } from './reach'

const hosted = { protocol: 'https:', hostname: 'app.muxtower.dev' }
const own = { protocol: 'http:', hostname: '10.1.1.102' }
const failed = new TypeError('Failed to fetch')

describe('why a daemon could not be reached', () => {
  it('says before trying that an https page cannot call plain http, and how to do it instead', () => {
    const said = blockedBeforeTrying('http://10.1.1.102:8731', hosted)
    expect(said).toContain('blocks a plain-HTTP daemon (http://10.1.1.102:8731)')
    expect(said).toContain('muxtower expose tailscale')
    expect(blockedBeforeTrying('http://127.0.0.1:8731', hosted)).toBeNull() // this machine's own: allowed
    expect(blockedBeforeTrying('https://nas.tailnet.ts.net', hosted)).toBeNull()
  })

  it('shows the address it tried when no scheme was typed', () => {
    expect(withScheme('10.1.1.102:8731')).toBe('http://10.1.1.102:8731')
    expect(whyUnreachable('10.1.1.102:8731', failed, hosted)).toContain('http://10.1.1.102:8731')
  })

  it('names the private-network restriction for a public page and a private address', () => {
    expect(isPrivate('10.1.1.102') && isPrivate('100.101.1.2') && isPrivate('mac.local')).toBe(true)
    expect(isPrivate('8.8.8.8') || isPrivate('app.muxtower.dev')).toBe(false)
    expect(whyUnreachable('https://100.101.1.2', failed, hosted)).toContain('private network access')
    expect(whyUnreachable('http://10.1.1.5:8731', failed, own)).not.toContain('private network')
  })

  it('otherwise says what to check, never just that it cannot reach', () => {
    const said = whyUnreachable('https://daemon.example', failed, hosted)
    expect(said).toContain('No answer from https://daemon.example')
    expect(said).toContain('`host`')
  })
})
