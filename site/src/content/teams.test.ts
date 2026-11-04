import { describe, expect, it } from 'vitest'
import { teamExamples } from './teams'

describe('team examples', () => {
  it('keep each team to three roles at most', () => {
    for (const t of teamExamples) expect(t.members.length).toBeLessThanOrEqual(3)
  })

  it('only hand work between you and the team’s own roles', () => {
    for (const t of teamExamples) {
      const roles = new Set(['you', ...t.members.map((m) => m.role)])
      for (const h of t.flow) expect(roles.has(h.from) && roles.has(h.to)).toBe(true)
    }
  })
})
