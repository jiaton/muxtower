import { describe as group, expect, it } from 'vitest'
import { describe, mayReport } from './error-report'

group('error reports', () => {
  it('carry the message, the stack, the page as its route pattern (no ids) and the browser', () => {
    const report = describe('render', new TypeError("reading 'length'"), '/d/k3x9daemon/s/sess-42abc')
    expect(report).toMatchObject({ kind: 'render', message: "reading 'length'", route: '/d/:daemon/s/:session' })
    expect(report.stack).toContain('TypeError')
    expect(JSON.stringify(report)).not.toMatch(/k3x9daemon|sess-42abc/)
  })
  it('go once per message, and a few a minute at most', () => {
    expect(mayReport('a', 0)).toBe(true)
    expect(mayReport('a', 1)).toBe(false)
    for (const m of ['b', 'c', 'd', 'e']) expect(mayReport(m, 2)).toBe(true)
    expect(mayReport('f', 3)).toBe(false) // five this minute
    expect(mayReport('f', 61_000)).toBe(true)
  })
})
