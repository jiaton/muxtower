import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import { sessionDetails } from './details'

const session = (over: Partial<Session> = {}) =>
  ({
    id: 'mac~abc',
    name: 's',
    runtime: 'claude-code',
    source: 'launched',
    machine: 'mac',
    node: 'mac',
    cwd: '/Users/me/workspace',
    ...over,
  }) as Session

describe('the details', () => {
  it('say where its agent works now, under the folder it started in', () => {
    const rows = sessionDetails(session({ working_dir: '/Users/me/workspace/launch-plan' }))
    const folder = rows.findIndex((r) => r.label === 'Folder')
    expect(rows[folder]).toMatchObject({ value: '~/workspace' })
    expect(rows[folder + 1]).toEqual({
      label: 'Working in',
      value: '~/workspace/launch-plan',
      code: true,
      copy: '/Users/me/workspace/launch-plan',
    })
  })
  it('leave it out while it works where it started', () => {
    expect(sessionDetails(session({ working_dir: null })).map((r) => r.label)).not.toContain('Working in')
  })
})
