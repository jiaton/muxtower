import { beforeEach, expect, it } from 'vitest'
import { countFrame, countRender, resetDiagnostics, snapshot, webAlerts } from './diagnostics'

beforeEach(resetDiagnostics)

it('counts the last minute of frames and the latest draws', () => {
  countFrame(2048, 0)
  countFrame(1024, 50_000)
  countFrame(512, 70_000) // the first is now over a minute old
  countRender(10)
  countRender(130)
  const usage = snapshot(70_000)
  expect([usage.framesPerMinute, usage.kbPerMinute, usage.renderAvgMs, usage.renderMaxMs]).toEqual([2, 1.5, 70, 130])
  expect(webAlerts(usage)).toEqual([{ metric: 'render', value: 70, threshold: 50 }])
})

it('has nothing to say before anything happened', () => {
  const usage = snapshot()
  expect([usage.renderAvgMs, usage.framesPerMinute]).toEqual([null, 0])
  expect(webAlerts({ ...usage, heapMb: null })).toEqual([])
})
