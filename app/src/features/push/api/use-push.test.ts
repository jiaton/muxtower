import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDaemonsStore } from '@/lib/daemons/store'
import { activated, renewSubscription } from './use-push'

/** A worker whose state can be moved along, as the browser does while installing it. */
function worker(state: ServiceWorkerState) {
  const target = new EventTarget() as ServiceWorker & { to: (s: ServiceWorkerState) => void }
  let current = state
  Object.defineProperty(target, 'state', { get: () => current })
  target.to = (s) => {
    current = s
    target.dispatchEvent(new Event('statechange'))
  }
  return target
}

describe('activated', () => {
  it('waits for a fresh registration to activate before it can subscribe', async () => {
    const installing = worker('installing')
    const reg = { active: null, waiting: null, installing } as unknown as ServiceWorkerRegistration
    let done = false
    const ready = activated(reg).then(() => (done = true))
    await Promise.resolve()
    expect(done).toBe(false)
    installing.to('installed')
    installing.to('activating')
    await Promise.resolve()
    expect(done).toBe(false)
    installing.to('activated')
    await ready
    expect(done).toBe(true)
  })

  it('returns at once when the registration is active', async () => {
    const reg = { active: worker('activated'), waiting: null, installing: null } as unknown as ServiceWorkerRegistration
    await expect(activated(reg)).resolves.toBe(reg)
  })

  it('fails when the worker cannot install', async () => {
    const installing = worker('installing')
    const reg = { active: null, waiting: null, installing } as unknown as ServiceWorkerRegistration
    const ready = activated(reg)
    installing.to('redundant')
    await expect(ready).rejects.toThrow(/failed to install/)
  })
})

describe('renewSubscription', () => {
  afterEach(() => vi.unstubAllGlobals())

  function browserWith(subscription: object | null) {
    const getRegistration = vi.fn(async () => ({ pushManager: { getSubscription: async () => subscription } }))
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { getRegistration } })
  }
  const client = () => ({ POST: vi.fn(async () => ({ data: { id: 'sub-1' }, response: new Response(null, { status: 200 }) })) })

  it("registers the browser's subscription again, with this device's settings", async () => {
    useDaemonsStore.setState({ daemons: [{ id: 'd1', name: 'nas', url: 'https://d', token: 't', pushDone: false }] } as never)
    browserWith({ toJSON: () => ({ endpoint: 'https://push/1', keys: { p256dh: 'k', auth: 'a' } }) })
    const c = client()
    await renewSubscription(c as never, 'd1')
    expect(c.POST).toHaveBeenCalledWith('/v1/push/subscriptions', {
      body: { endpoint: 'https://push/1', keys: { p256dh: 'k', auth: 'a' }, client_ref: 'd1', done: false, muted: [] },
    })
    expect(useDaemonsStore.getState().daemons[0].pushSubscriptionId).toBe('sub-1')
  })

  it('does nothing when this browser has no subscription', async () => {
    browserWith(null)
    const c = client()
    await renewSubscription(c as never, 'd1')
    expect(c.POST).not.toHaveBeenCalled()
  })
})
