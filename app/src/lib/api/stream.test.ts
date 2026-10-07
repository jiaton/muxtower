import { describe, expect, it } from 'vitest'
import { DaemonStream } from './stream'

const noop = { onFrame: () => {}, onStatus: () => {}, onAuth: () => {} }

describe('stream auth order', () => {
  it('uses the cookie only when the app is served by the daemon itself', () => {
    const same = new DaemonStream({ id: 'a', name: 'a', url: 'https://d.example', token: 't' }, noop)
    expect(same.methods('https://d.example')).toEqual(['cookie', 'subprotocol', 'query'])
    expect(same.methods('https://app.example')).toEqual(['subprotocol', 'query'])
  })

  it('tries the method that worked last time first', () => {
    const stream = new DaemonStream({ id: 'a', name: 'a', url: 'https://d.example', token: 't', streamAuth: 'query' }, noop)
    expect(stream.methods('https://app.example')).toEqual(['query', 'subprotocol'])
  })
})
