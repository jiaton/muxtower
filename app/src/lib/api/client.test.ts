import { describe, expect, it } from 'vitest'
import { responseKind } from './client'

const res = (status: number, daemon = false) =>
  new Response(null, { status, headers: daemon ? { 'X-Muxtower-Auth': 'invalid-credentials' } : {} })

describe('responseKind', () => {
  it('tells a revoked token from a gate in front', () => {
    expect(responseKind(res(200))).toBe('ok')
    expect(responseKind(res(401, true))).toBe('rejected')
    expect(responseKind(res(401))).toBe('blocked')
    expect(responseKind(res(403))).toBe('blocked')
    expect(responseKind(res(500))).toBe('error')
  })
})
