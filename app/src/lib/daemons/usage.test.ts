import { describe, expect, it } from 'vitest'
import type { MachineUsage } from '@/lib/api/types'
import { alertText, usageParts } from './usage'

describe('usage', () => {
  it('says what it cannot read is unknown, never 0', () => {
    const mac = { machine: 'mac', sampled_at: '2026-11-03T12:00:00Z', stale: false, cpu_1m: 0, rss_mb: null, tick: {} } as MachineUsage
    expect(usageParts(mac)).toEqual([
      'CPU 0% (10 min unknown)',
      'memory unknown',
      'unknown threads',
      'unknown open files',
      'screens unknown a round (max unknown)',
    ])
  })

  it('says what is over its limit, and the limit', () => {
    expect(alertText({ metric: 'tick', value: 420, threshold: 200 })).toBe('Reading the screens takes 420 ms a round (limit 200 ms)')
    expect(alertText({ metric: 'heap', value: 600, threshold: 500, severe: false })).toBe('JS heap 600 MB (limit 500 MB)')
  })

  it('names the slowest key or tap by its event and where it landed', () => {
    const slowest = { at: 0, ms: 420, type: 'keydown', target: 'the message box' }
    expect(alertText({ metric: 'input-slow', value: 4, threshold: 300, severe: false, slowest })).toBe(
      '4 keys or taps took over 300 ms in the last 5 min; the slowest: keydown on the message box: 420 ms',
    )
    expect(alertText({ metric: 'input-slow', value: 3, threshold: 300, severe: false })).toBe(
      '3 keys or taps took over 300 ms in the last 5 min',
    )
    expect(alertText({ metric: 'dom-growth', value: 3.1, threshold: 2, severe: true })).toBe(
      'The page has 3.1× the elements it had once settled, besides terminal and conversation history: reload it (limit 2×)',
    )
  })
})
