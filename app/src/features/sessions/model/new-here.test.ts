import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { SessionEntry } from './facets'
import { computerOf, presetForDevice, presetForFolder, presetForSession } from './new-here'

const daemon = { id: 'd1', name: 'nas' } as never
const NODES = ['mac']
/** Sessions as the hub lists them: its own terminals, a node's, Remote Control on either, a cloud one. */
const hub = (over: Partial<Session> = {}) =>
  ({ id: 'abc', name: 's', source: 'launched', machine: 'nas', on_host: true, node: null, cwd: '/home/me/code/shop', ...over }) as Session
const nodeTmux = (over: Partial<Session> = {}) => hub({ id: 'mac~def', machine: 'mac', node: 'mac', cwd: '/Users/me/code/app', ...over })
const rcOnMac = (over: Partial<Session> = {}) =>
  hub({ id: 'cse_01MAC', source: 'remote_control', machine: 'mac', on_host: false, cwd: '/Users/me/code/app', ...over })
const rcOnHub = () => hub({ id: 'cse_01NAS', source: 'remote_control', on_host: true })
const cloud = () => hub({ id: 'cse_01CLOUD', source: 'remote_control', machine: null, on_host: false, cwd: '/workspace' })
const entry = (s: Session): SessionEntry => ({ key: `d1/${s.id}`, daemon, session: s }) as SessionEntry

describe('the computer a new session starts on', () => {
  it('is where the list groups the session: the hub, a node, or nowhere', () => {
    expect(computerOf(hub(), NODES)).toBeNull()
    expect(computerOf(nodeTmux(), NODES)).toBe('mac')
    expect(computerOf(rcOnMac(), NODES)).toBe('mac') // no `~` in its id, still on the Mac
    expect(computerOf(rcOnHub(), NODES)).toBeNull()
    expect(computerOf(cloud(), NODES)).toBeUndefined()
    expect(computerOf(rcOnMac(), [])).toBeUndefined() // the Mac not connected: not the hub instead
  })
})

describe('presets for a new session', () => {
  it('a Mac folder holding only Remote Control sessions: on the Mac, in that folder', () => {
    expect(presetForFolder([entry(rcOnMac())], NODES)).toEqual({ daemonId: 'd1', node: 'mac', cwd: '/Users/me/code/app' })
  })
  it('a mixed folder (a cloud session first): the first that can start, on its computer', () => {
    expect(presetForFolder([entry(cloud()), entry(nodeTmux())], NODES)).toMatchObject({ node: 'mac' })
    expect(presetForFolder([entry(cloud())], NODES)).toBeNull()
  })
  it('a hub folder: the hub; its repository, or a worktree path given', () => {
    const s = hub({ cwd: '/code/shop/api', git: { repo: '/code/shop', worktree: '/code/shop' } as Session['git'] })
    expect(presetForFolder([entry(s)], NODES)).toEqual({ daemonId: 'd1', node: null, cwd: '/code/shop' })
    expect(presetForFolder([entry(s)], NODES, '/w/feature')?.cwd).toBe('/w/feature')
  })
  it('a node session and a device: its node, the default folder for a device', () => {
    expect(presetForSession('d1', nodeTmux(), NODES)).toEqual({ daemonId: 'd1', node: 'mac', cwd: '/Users/me/code/app' })
    expect(presetForDevice([entry(rcOnMac())], NODES)).toEqual({ daemonId: 'd1', node: 'mac', cwd: '' })
  })
  it('"New session here" on a Remote Control session on the Mac: the Mac, its folder, its team', () => {
    expect(presetForSession('d1', rcOnMac({ project: 'acme/app' }), NODES)).toEqual({
      daemonId: 'd1',
      node: 'mac',
      cwd: '/Users/me/code/app',
      project: 'acme/app',
    })
    expect(presetForSession('d1', cloud(), NODES)).toBeNull()
  })
  it('in a git worktree: the worktree, not the main folder', () => {
    const s = hub({ cwd: '/w/feature/src', git: { repo: '/code/shop', worktree: '/w/feature' } as Session['git'] })
    expect(presetForSession('d1', s, NODES)?.cwd).toBe('/w/feature')
  })
})
