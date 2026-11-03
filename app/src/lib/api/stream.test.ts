import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDLE_MS, PONG_TIMEOUT_MS } from './heartbeat'
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

class FakeSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static made: FakeSocket[] = []
  readyState = FakeSocket.CONNECTING
  sent: string[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  constructor() {
    FakeSocket.made.push(this)
  }
  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.readyState = FakeSocket.CLOSED
  }
  drop() {
    this.close()
    this.onclose?.()
  }
}

describe('stream reconnects', () => {
  const daemon = { id: 'a', name: 'a', url: 'https://d.example', token: 't', streamAuth: 'subprotocol' as const }
  let statuses: string[]

  beforeEach(() => {
    vi.useFakeTimers()
    FakeSocket.made = []
    statuses = []
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    )
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  async function connected() {
    const stream = new DaemonStream(daemon, { ...noop, onStatus: (s) => statuses.push(s) })
    stream.start()
    await vi.waitFor(() => expect(FakeSocket.made).toHaveLength(1))
    FakeSocket.made[0].open()
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('open'))
    return stream
  }

  it('connects at once when the page is shown again, not at the end of the backoff', async () => {
    const stream = await connected()
    FakeSocket.made[0].drop() // the phone slept: the daemon closed it
    expect(statuses.at(-1)).toBe('offline')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(FakeSocket.made).toHaveLength(2)) // no timer advanced
    FakeSocket.made[1].open()
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('open'))
    window.dispatchEvent(new Event('online')) // already open: it asks instead of connecting again
    expect(FakeSocket.made[1].sent.at(-1)).toBe('{"type":"ping"}')
    stream.stop()
  })

  it('takes a connection that stops answering for dead and replaces it', async () => {
    const stream = await connected()
    const first = FakeSocket.made[0]
    await vi.advanceTimersByTimeAsync(IDLE_MS)
    expect(first.sent.at(-1)).toBe('{"type":"ping"}')
    first.onmessage?.({ data: '{"type":"pong"}' }) // answered: still alive
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS)
    expect(FakeSocket.made).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(IDLE_MS + PONG_TIMEOUT_MS) // asked again, and nothing comes back
    await vi.waitFor(() => expect(FakeSocket.made).toHaveLength(2))
    expect(first.readyState).toBe(FakeSocket.CLOSED)
    stream.stop()
  })
})
