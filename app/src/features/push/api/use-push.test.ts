import { describe, expect, it } from 'vitest'
import { activated } from './use-push'

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
