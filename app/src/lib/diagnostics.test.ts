import { beforeEach, expect, it } from 'vitest'
import {
  checkRenderer,
  countFrame,
  countInput,
  countLongFrame,
  countRender,
  resetDiagnostics,
  sample,
  snapshot,
  softwareRenderer,
  webAlerts,
} from './diagnostics'

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

const metrics = (now: number) => webAlerts({ ...snapshot(now), heapMb: null }).map((a) => a.metric)

it('says when keys and taps are answered slowly: p75 over 100 ms, or over 300 ms again and again', () => {
  for (let i = 0; i < 20; i++) countInput(i < 14 ? 40 : 150, 1000 + i)
  expect(snapshot(2000)).toMatchObject({ inputP75Ms: 150, inputMaxMs: 150, inputSlow: 0 })
  expect(metrics(2000)).toEqual(['input'])

  resetDiagnostics()
  for (let i = 0; i < 20; i++) countInput(30, 1000 + i)
  countInput(400, 1100)
  countInput(350, 1200)
  expect(metrics(2000)).toEqual([]) // once or twice: no pattern
  countInput(500, 1300)
  expect(metrics(2000)).toEqual(['input-slow'])
  expect(metrics(1300 + 6 * 60_000)).toEqual([]) // five minutes on, forgotten
})

it('says when long frames block over a fifth of the last minute', () => {
  countLongFrame(4000, 10_000)
  countLongFrame(6000, 20_000)
  expect(snapshot(30_000)).toMatchObject({ longFramesPerMinute: 2, blockedShare: 0.17, longestFrameMs: 6000 })
  expect(metrics(30_000)).toEqual([])
  countLongFrame(3000, 25_000)
  expect(metrics(30_000)).toEqual(['blocking'])
  expect(snapshot(90_000)).toMatchObject({ longFramesPerMinute: 0, longestFrameMs: 6000 }) // the worst is kept 10 min
})

it('says when the page grew to twice its size since it was loaded, not for a small page or a blip', () => {
  const minute = 60_000
  for (let i = 0; i < 5; i++) sample(i * minute, 3000, 80)
  for (let i = 5; i < 9; i++) sample(i * minute, 3000 + i * 300, 90)
  sample(9 * minute, 9000, 90) // one blip
  expect(snapshot(10 * minute).domGrowth).toBe(1.7) // the median of the newest
  expect(metrics(10 * minute)).toEqual([])
  for (let i = 10; i < 15; i++) sample(i * minute, 7000, 200)
  expect(snapshot(15 * minute)).toMatchObject({ domNodes: 7000, domGrowth: 2.3, heapGrowth: 2.5 })
  expect(webAlerts({ ...snapshot(15 * minute), heapMb: 200 }).map((a) => a.metric)).toEqual(['dom-growth', 'heap-growth'])

  resetDiagnostics()
  for (let i = 0; i < 10; i++) sample(i * minute, i < 5 ? 300 : 900, null) // tripled, but a small page
  expect(metrics(10 * minute)).toEqual([])
})

it('keeps hours of samples bounded, with the first ones', () => {
  for (let i = 0; i < 2000; i++) sample(i * 60_000, 1000 + i, null)
  const usage = snapshot(2000 * 60_000)
  expect(usage.domNodes).toBe(2999)
  expect(usage.domGrowth).toBeGreaterThan(2.5) // still measured against the page as it was loaded
})

it('says when the browser draws without its GPU', () => {
  expect(softwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe(true)
  expect(softwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true)
  expect(softwareRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)')).toBe(false)
  checkRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)')
  expect(metrics(0)).toEqual([])
  checkRenderer('Google SwiftShader')
  expect(snapshot().renderer).toEqual({ name: 'Google SwiftShader', software: true })
  expect(metrics(0)).toEqual(['gpu'])
})
