import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { SessionEntry } from './facets'
import { presetForDevice, presetForFolder, presetForSession } from './new-here'

const daemon = { id: 'd1', name: 'nas' } as never
const session = (over: Partial<Session>): Session =>
  ({ id: 's1', name: 's', machine: 'nas', cwd: '/home/me/code/shop', ...over }) as Session
const entry = (s: Session): SessionEntry => ({ key: `d1/${s.id}`, daemon, session: s }) as SessionEntry

describe('presets for a new session', () => {
  it('here, on a session: its machine, its folder, its team', () => {
    expect(presetForSession('d1', session({ project: 'acme/shop' }))).toEqual({
      daemonId: 'd1',
      node: null,
      cwd: '/home/me/code/shop',
      project: 'acme/shop',
    })
    expect(presetForSession('d1', session({ id: 'mac~s2', machine: 'mac', cwd: '/Users/me/x' }))).toEqual({
      daemonId: 'd1',
      node: 'mac',
      cwd: '/Users/me/x',
    })
  })
  it('here, in a git worktree: the worktree, not the main folder', () => {
    const s = session({ cwd: '/w/feature/src', git: { repo: '/code/shop', worktree: '/w/feature' } as Session['git'] })
    expect(presetForSession('d1', s).cwd).toBe('/w/feature')
  })
  it('in a folder: the repository it lists, or the path it is given (a worktree)', () => {
    const s = session({ cwd: '/code/shop/api', git: { repo: '/code/shop', worktree: '/code/shop' } as Session['git'] })
    expect(presetForFolder([entry(s)])).toEqual({ daemonId: 'd1', node: null, cwd: '/code/shop' })
    expect(presetForFolder([entry(s)], '/w/feature')?.cwd).toBe('/w/feature')
    expect(presetForFolder([])).toBeNull()
  })
  it('on a device: its machine, the default folder', () => {
    expect(presetForDevice([entry(session({ id: 'mac~s2', machine: 'mac' }))])).toEqual({ daemonId: 'd1', node: 'mac', cwd: '' })
  })
})
