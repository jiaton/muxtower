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
    expect(alertText({ metric: 'heap', value: 600, threshold: 500 })).toBe('JS heap 600 MB (limit 500 MB)')
  })
})
