import { beforeEach, expect, it } from 'vitest'
import {
  checkRenderer,
  countFrame,
  countInput,
  countInteraction,
  countLongFrame,
  countRender,
  resetDiagnostics,
  sample,
  snapshot,
  softwareRenderer,
  type PageSize,
} from './diagnostics'
import { alertKey, webAlerts } from './diagnostics-alerts'

beforeEach(resetDiagnostics)

it('counts the last minute of frames and the latest draws', () => {
  countFrame(2048, 0)
  countFrame(1024, 50_000)
  countFrame(512, 70_000) // the first is now over a minute old
  countRender(10)
  countRender(130)
  const usage = snapshot(70_000)
  expect([usage.framesPerMinute, usage.kbPerMinute, usage.renderAvgMs, usage.renderMaxMs]).toEqual([2, 1.5, 70, 130])
  expect(webAlerts(usage)).toEqual([{ metric: 'render', value: 70, threshold: 50, severe: false }])
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

it('keeps one entry per interaction, said by the event whose handlers ran longest', () => {
  countInput(320, 1000, { type: 'pointerdown', target: 'a button in the session list', id: 7, work: 2 })
  countInput(340, 1000, { type: 'pointerup', target: 'a button in the session list', id: 7, work: 1 })
  countInput(340, 1001, { type: 'click', target: 'a button in the session list', id: 7, work: 290 })
  countInput(420, 2000, { type: 'keydown', target: 'the message box', id: 8, work: 380 })
  countInput(420, 2001, { type: 'keyup', target: 'the message box', id: 8, work: 1 })
  const usage = snapshot(3000)
  expect(usage.inputSlow).toBe(2) // two interactions, not five events
  expect(usage.slowInputs).toEqual([
    { at: 2000, ms: 420, type: 'keydown', target: 'the message box' },
    { at: 1000, ms: 340, type: 'click', target: 'a button in the session list' },
  ])
})

it('counts the keys and taps the browser did not time (under 16 ms) in the p75', () => {
  for (let i = 0; i < 5; i++) countInput(150, 1000 + i, { id: i + 1 })
  expect(snapshot(2000).inputP75Ms).toBe(150) // only the timed ones: all slow
  for (let i = 0; i < 20; i++) countInteraction(1000 + i)
  expect(snapshot(2000)).toMatchObject({ inputP75Ms: 0, inputMaxMs: 150 }) // 5 of 20: the p75 was quick
  expect(metrics(2000)).toEqual([])
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

const minute = 60_000
/** The page at minute `i`: `dom` elements, `bounded` of them in terminal and conversation history. */
const page = (i: number, dom: number, extra: Partial<PageSize> = {}): PageSize => ({
  dom,
  bounded: 0,
  heapMb: null,
  age: i * minute,
  session: true,
  ...extra,
})

it('measures growth against the page once settled (a minute in, a session shown), not as first drawn', () => {
  sample(0, page(0, 400)) // the boot screen and an empty list
  expect(snapshot(0).domSettled).toBeNull()
  sample(minute, page(1, 2500, { session: false })) // the list alone: not settled yet
  sample(2 * minute, page(2, 3000)) // a session shown: settled
  for (let i = 3; i < 8; i++) sample(i * minute, page(i, 3300))
  expect(snapshot(8 * minute)).toMatchObject({ domSettled: 3000, domGrowth: 1.1 }) // against 3000, never the 400
  expect(metrics(8 * minute)).toEqual([])
})

it('settles after five minutes whatever is shown', () => {
  for (let i = 1; i <= 5; i++) sample(i * minute, page(i, 2000, { session: false }))
  expect(snapshot(5 * minute).domSettled).toBe(2000)
})

it('leaves out terminal and conversation history, which grow to a bound by design', () => {
  sample(minute, page(1, 3000, { bounded: 500 }))
  // A long conversation and a scrolled-up terminal: 12,000 elements, 9,500 of them history.
  for (let i = 2; i < 8; i++) sample(i * minute, page(i, 12_000, { bounded: 9500 }))
  expect(snapshot(8 * minute)).toMatchObject({ domNodes: 12_000, domBounded: 9500, domSettled: 2500, domGrowth: 1 })
  expect(metrics(8 * minute)).toEqual([])
})

it('says when the page itself doubled since it settled, and that tripled is severe', () => {
  sample(minute, page(1, 3000, { heapMb: 80 }))
  for (let i = 2; i < 6; i++) sample(i * minute, page(i, 3000 + i * 300, { heapMb: 90 }))
  sample(6 * minute, page(6, 9000, { heapMb: 90 })) // one blip
  expect(snapshot(7 * minute).domGrowth).toBe(1.4) // the median of the newest
  expect(metrics(7 * minute)).toEqual([])
  for (let i = 7; i < 12; i++) sample(i * minute, page(i, 7000, { heapMb: 200 }))
  expect(snapshot(12 * minute)).toMatchObject({ domNodes: 7000, domGrowth: 2.3, heapGrowth: 2.5 })
  const alerts = webAlerts({ ...snapshot(12 * minute), heapMb: 200 })
  expect(alerts.map((a) => [a.metric, a.severe])).toEqual([
    ['dom-growth', false],
    ['heap-growth', false],
  ])
  for (let i = 12; i < 17; i++) sample(i * minute, page(i, 9500))
  expect(webAlerts(snapshot(17 * minute)).find((a) => a.metric === 'dom-growth')).toMatchObject({ value: 3.2, severe: true })

  resetDiagnostics()
  for (let i = 1; i < 10; i++) sample(i * minute, page(i, i < 2 ? 300 : 900)) // tripled, but a small page
  expect(metrics(10 * minute)).toEqual([])
})

it('keeps hours of samples bounded', () => {
  for (let i = 1; i < 2000; i++) sample(i * minute, page(i, 1000 + i))
  const usage = snapshot(2000 * minute)
  expect(usage.domNodes).toBe(2999)
  expect(usage.domSettled).toBe(1001)
  expect(usage.domGrowth).toBeGreaterThan(2.5) // still against the page as it settled
})

it('is severe only for what an action fixes: the GPU lost, a heap near what a phone keeps', () => {
  expect(webAlerts({ ...snapshot(0), heapMb: 600 }).map((a) => [a.metric, a.severe])).toEqual([['heap', false]])
  expect(webAlerts({ ...snapshot(0), heapMb: 1200 }).map((a) => [a.metric, a.severe])).toEqual([['heap', true]])
  checkRenderer('Google SwiftShader')
  const gpu = webAlerts({ ...snapshot(0), heapMb: null })[0]!
  expect([gpu.severe, alertKey(gpu, 1)]).toEqual([true, 'gpu:Google SwiftShader']) // the same across reloads
  expect(alertKey({ metric: 'dom-growth', value: 3, threshold: 2, severe: true }, 1)).not.toBe(
    alertKey({ metric: 'dom-growth', value: 3, threshold: 2, severe: true }, 2), // a reload: a new condition
  )
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
