import { describe, expect, it } from 'vitest'
import { DEVICES, deviceName, initialWorld, metaOf, sessionById } from './world'

describe('the demo world', () => {
  it('has five machines, one of them the hub', () => {
    expect(DEVICES).toHaveLength(5)
    expect(DEVICES.filter((d) => d.hub)).toHaveLength(1)
  })

  it('starts fresh every time, so a replay is never changed by the last run', () => {
    const first = initialWorld()
    sessionById(first, 'api')!.state = 'unread'
    first.messages.api.push({ id: 'x', kind: 'you', text: 'x' })
    const second = initialWorld()
    expect(sessionById(second, 'api')?.state).toBe('working')
    expect(second.messages.api.some((m) => m.id === 'x')).toBe(false)
  })

  it('runs Claude Code and Codex, and lists sessions from tmux, Claude desktop and the Codex app', () => {
    const { sessions } = initialWorld()
    expect(new Set(sessions.map((s) => s.agent))).toEqual(new Set(['claude', 'codex']))
    expect(new Set(sessions.map((s) => s.source))).toEqual(new Set(['muxtower', 'tmux', 'Desktop app']))
  })

  it('names machines', () => {
    expect(deviceName('mac')).toBe('macbook')
  })

  it('writes a session’s line as the app does', () => {
    expect(metaOf(sessionById(initialWorld(), 'api')!)).toBe('vps · api · tmux')
  })
})
