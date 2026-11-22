import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { logPush, pushRecord, readPushLog, RING_SIZE, safeTag, scopeDaemon } from './push-log'

const SCOPE = 'https://app.example/push/hub-1/'

it("keeps a trigger's tag without its name, the owner's words; session tags as they are", () => {
  expect(safeTag('hub-1:trigger:deal-watch')).toBe('hub-1:trigger')
  expect(safeTag('hub-1:sess-42')).toBe('hub-1:sess-42')
  expect(safeTag('hub-1:build-box~sess-42')).toBe('hub-1:build-box~sess-42')
})

it('names the daemon a push registration is for, by its scope', () => {
  expect(scopeDaemon(SCOPE)).toBe('hub-1')
  expect(scopeDaemon('https://app.example/sub/push/hub%202/')).toBe('hub 2')
  expect(scopeDaemon('https://app.example/')).toBeNull()
})

it("a push's record: what it was for, what was there, what closed and what was held, by tag only", () => {
  const outcome = {
    asked: ['hub-1:a', 'hub-1:trigger:deal-watch'],
    present: [{ tag: 'hub-1:a', at: 5 }],
    closed: [],
    held: ['hub-1:a'],
  }
  const record = pushRecord('clear', { kind: 'clear', ref: 'hub-1', scope: SCOPE, version: '0.1.204' }, outcome, true, 1000)
  expect(record).toEqual({
    at: 1000,
    event: 'clear',
    kind: 'clear',
    ref: 'hub-1',
    scope: 'hub-1',
    origin: 'app.example',
    version: '0.1.204',
    session: null,
    tag: null,
    asked: ['hub-1:a', 'hub-1:trigger'],
    present: [{ tag: 'hub-1:a', at: 5 }],
    closed: [],
    held: ['hub-1:a'],
    keepOne: true,
  })
})

it(`keeps the newest ${RING_SIZE}, under keys that only grow`, async () => {
  for (let i = 0; i < RING_SIZE + 5; i++) await logPush(pushRecord('dismiss', { tag: `hub-1:s${i}`, scope: SCOPE, version: '' }, undefined, false, i))
  const kept = await readPushLog()
  expect(kept).toHaveLength(RING_SIZE)
  expect(kept[0]!.record.tag).toBe('hub-1:s5')
  expect(kept.at(-1)!.record.tag).toBe(`hub-1:s${RING_SIZE + 4}`)
  expect(kept.every((k, i) => i === 0 || k.key > kept[i - 1]!.key)).toBe(true)
})
