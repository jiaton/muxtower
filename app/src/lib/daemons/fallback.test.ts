import { describe, expect, it } from 'vitest'
import type { Daemon } from './types'
import { directPlace, isActive, nodesBack, probeOf, withDirect } from './fallback'

const hub: Daemon = { id: 'h', name: 'hub', url: 'https://hub.example', token: 't' }
const found = [
  { node: 'mac', url: 'https://mac.tailnet.ts.net/', token: 'm1' },
  { node: 'pi', url: 'http://pi.local:8731', token: 'p1' }, // an https page cannot reach it
]

describe('direct fallback', () => {
  it('tells a hub that is down from one that answers but lets this device in no more', () => {
    expect(probeOf({ error: new TypeError('Failed to fetch') })).toBe('down')
    expect(probeOf({ status: 502 })).toBe('down') // its proxy, nothing behind it
    expect(probeOf({ status: 401 })).toBe('answers') // revoked: no reason to go around it
    expect(probeOf({ status: 200, gate: true })).toBe('answers') // a sign-in page
    expect(probeOf({ status: 200 })).toBe('up')
  })

  it('keeps one daemon per node the hub hands over, https only, and only those it still lists', () => {
    const first = withDirect([hub], hub, found)
    expect(first.map((d) => [d.id, d.url, d.token, d.via])).toEqual([
      ['h', 'https://hub.example', 't', undefined],
      ['h~mac', 'https://mac.tailnet.ts.net', 'm1', 'h'],
    ])
    const rejected = first.map((d) => (d.id === 'h~mac' ? { ...d, rejected: true, streamAuth: 'subprotocol' as const } : d))
    const again = withDirect(rejected, hub, [{ node: 'mac', url: 'https://mac.tailnet.ts.net', token: 'm2' }])
    expect(again.find((d) => d.id === 'h~mac')).toMatchObject({ token: 'm2', rejected: false, streamAuth: 'subprotocol' }) // a fresh token
    expect(withDirect(again, hub, []).map((d) => d.id)).toEqual(['h']) // a node it no longer lists
  })

  it('talks to the nodes only while their hub is down, and goes back once it has them again', () => {
    const [, mac] = withDirect([hub], hub, found)
    expect([isActive(hub, {}), isActive(mac, {}), isActive(mac, { h: 1 })]).toEqual([true, false, true])
    expect(nodesBack([{ name: 'mac', online: false }], ['mac'])).toBe(false)
    expect(nodesBack([{ name: 'mac', online: true }], ['mac'])).toBe(true)
  })

  it('keeps the open session across the switch, both ways', () => {
    const daemons = withDirect([hub], hub, found)
    expect(directPlace(daemons, 'h', 'mac~abc', { h: 1 })).toEqual({ daemonId: 'h~mac', sessionId: 'abc' })
    expect(directPlace(daemons, 'h~mac', 'abc', {})).toEqual({ daemonId: 'h', sessionId: 'mac~abc' })
    expect(directPlace(daemons, 'h', 'local1', { h: 1 })).toBeNull() // the hub's own: nowhere else to go
    expect(directPlace(daemons, 'h', 'mac~abc', {})).toBeNull()
  })
})
