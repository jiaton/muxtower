import { describe, expect, it } from 'vitest'
import type { RuntimeInfo, Session, Trigger } from '@/lib/api/types'
import { draftOf, EMPTY_DRAFT, patchOf, problems, specOf } from './draft'
import { curlExample, LAN_PLACEHOLDER, lanBase } from './fire-url'
import { actionSummary, agoText, limitsSummary } from './summary'
import { resolvedText, runsUnguarded, sessionsFor, targetsOf } from './targets'

const session = (fields: Partial<Session>) => ({ id: 's1', name: 'one', archived_at: null, runtime: 'claude-code', ...fields }) as Session

describe('summaries', () => {
  it('says what a trigger does and its limits, short', () => {
    expect(actionSummary({ kind: 'deliver', to: 'buyer@acme/deals' })).toBe('→ buyer@acme/deals')
    expect(actionSummary({ kind: 'start', cwd: '/home/dev/code', message: 'x', runtime: 'claude-code' })).toBe('start in ~/code')
    expect(actionSummary({ kind: 'notify' })).toBe('notify')
    expect(limitsSummary({ rate_per_hour: 3, dedupe: { days: 7, field: null } })).toBe('3/h · dedupe 7d')
    expect(limitsSummary({ rate_per_hour: null, dedupe: null })).toBe('')
    expect(agoText(new Date().toISOString())).toBe('just now')
  })
})

describe('the draft', () => {
  it('says what is wrong only for what is wrong', () => {
    expect(problems(EMPTY_DRAFT)).toMatchObject({ name: expect.any(String), to: expect.any(String) })
    expect(problems({ ...EMPTY_DRAFT, name: 'Deploy Failed', to: 'x' }).name).toMatch(/lowercase/i)
    expect(problems({ ...EMPTY_DRAFT, name: 'ok', to: 'x', rate: '0' }).rate).toBeTruthy()
    expect(problems({ ...EMPTY_DRAFT, name: 'ok', to: 'x', dedupe: true, dedupeBy: 'field' }).dedupe).toBeTruthy()
    expect(problems({ ...EMPTY_DRAFT, name: 'ok', to: 'x', dedupe: true, dedupeBy: 'key' })).toEqual({})
  })

  it('makes a spec, and a patch that clears limits taken away', () => {
    const d = { ...EMPTY_DRAFT, name: 'deals', to: 'buyer@acme/deals', dedupe: true, dedupeBy: 'key' as const, rate: '3' }
    expect(specOf(d)).toEqual({
      name: 'deals',
      enabled: true,
      action: { kind: 'deliver', to: 'buyer@acme/deals' },
      filter: [],
      dedupe: { days: 7, field: null },
      rate_per_hour: 3,
    })
    expect(patchOf({ ...d, dedupe: false, rate: '' })).toMatchObject({ clear_dedupe: true, clear_rate: true })
    expect(patchOf({ ...d, dedupe: false, rate: '' })).not.toHaveProperty('dedupe')
  })

  it('reads a trigger back as it was written', () => {
    const t = {
      id: 't', name: 't', enabled: true, created_at: '', updated_at: '',
      action: { kind: 'start', cwd: '/srv', machine: 'laptop', role: 'triage', project: 'acme/app', message: 'm {payload}', runtime: 'codex' },
      filter: [{ field: 'a.b', op: 'regex', value: '^x' }], dedupe: { days: 3, field: 'id' }, rate_per_hour: 5,
    } as Trigger // prettier-ignore
    const d = draftOf(t)
    expect(d).toMatchObject({ kind: 'start', machine: 'laptop', dedupeBy: 'field', dedupeField: 'id', dedupeDays: '3', rate: '5' })
    expect(specOf(d).action).toEqual(t.action)
  })
})

describe('where a trigger is fired', () => {
  it('uses the hub address only when it is on a private network', () => {
    expect(lanBase('http://192.168.1.20:8731/')).toBe('http://192.168.1.20:8731')
    expect(lanBase('http://build-box.local:8731')).toBe('http://build-box.local:8731')
    expect(lanBase('https://muxtower.example.com')).toBe(LAN_PLACEHOLDER)
    expect(curlExample(LAN_PLACEHOLDER, 'deals', 's3cret')).toContain("X-Muxtower-Trigger-Secret: s3cret")
  })
})

describe('targets', () => {
  const sessions = [
    session({ id: 'a', name: 'buyer', team_role: 'buyer', project: 'acme/deals', permission_mode: 'bypassPermissions' }),
    session({ id: 'b', name: 'loose' }),
    session({ id: 'c', name: 'old', team_role: 'buyer', project: 'acme/deals', archived_at: '2026-01-01T00:00:00Z' }),
  ]
  it('offers role@project where it can, else the id; never an archived one', () => {
    expect(targetsOf(sessions).map((t) => t.value)).toEqual(['buyer@acme/deals', 'a', 'b'])
    expect(resolvedText(sessionsFor('buyer@acme/deals', sessions))).toBe('→ buyer in acme/deals')
    expect(sessionsFor('buyer@acme/deals', sessions).map((s) => s.id)).toEqual(['a'])
    expect(sessionsFor('b', sessions).map((s) => s.id)).toEqual(['b'])
  })
  it('tells a session that acts without asking', () => {
    const runtimes = [{ name: 'claude-code', permission_modes: [{ id: 'yes', label: 'Yes', dangerous: true }] }] as RuntimeInfo[]
    expect(runsUnguarded(sessions[0]!)).toBe(true)
    expect(runsUnguarded(session({ permission_mode: 'yes' }), runtimes)).toBe(true)
    expect(runsUnguarded(session({ permission_mode: 'plan' }), runtimes)).toBe(false)
    expect(runsUnguarded(sessions[1]!)).toBe(false)
  })
})
