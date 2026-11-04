import { describe, expect, it } from 'vitest'
import { IDS, sessionsSeed } from './seed'

describe('seed', () => {
  it('joins every conversation partway: several items already there', () => {
    const { messages } = sessionsSeed()
    for (const id of ['research', 'worker', 'api']) expect(messages[id].length).toBeGreaterThanOrEqual(4)
  })

  it('gives sessions ids shaped like the daemon’s', () => {
    for (const id of Object.values(IDS)) expect(id).toMatch(/^[0-9a-f]{12}$/)
  })

  it('has the two teammates started by muxtower, the only sessions that reach it as themselves', () => {
    const { sessions } = sessionsSeed()
    for (const s of sessions.filter((s) => s.role)) expect(s.source).toBe('muxtower')
  })
})
