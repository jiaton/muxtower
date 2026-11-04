import { describe, expect, it } from 'vitest'
import { counts, groupsByDevice, sessionsOn } from './lists'
import { initialWorld, sessionById } from './world'

describe('lists', () => {
  it('groups by machine, the hub first, leaving out sessions not found yet', () => {
    const groups = groupsByDevice(initialWorld())
    expect(groups[0].device.hub).toBe(true)
    expect(groups.flatMap((g) => g.sessions).some((s) => s.hidden)).toBe(false)
  })

  it('puts a fork and a side chat right under their parent', () => {
    const world = initialWorld()
    sessionById(world, 'fork')!.hidden = false
    sessionById(world, 'side')!.hidden = false
    const mac = groupsByDevice(world).find((g) => g.device.id === 'mac')!
    expect(mac.sessions.map((s) => s.id)).toEqual(['research', 'fork', 'side'])
  })

  it('counts what needs the owner', () => {
    const world = initialWorld()
    sessionById(world, 'worker')!.state = 'permission'
    expect(counts(world)).toMatchObject({ all: 5, needs: 1, working: 2 })
    expect(sessionsOn(world, 'vps').map((s) => s.id)).toEqual(['api'])
  })
})
