import { expect, it } from 'vitest'
import { FRAME_BYTES, Segmenter, joinText } from './segmenter'

const frame = (loud: boolean) => {
  const bytes = new Uint8Array(FRAME_BYTES)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < FRAME_BYTES / 2; i++) view.setInt16(i * 2, loud ? (i % 2 ? 3000 : -3000) : 10, true)
  return bytes
}
const run = (pattern: string) => pattern.split('').map((c) => frame(c === 'x'))

it('cuts at a pause after speech and drops pure silence', () => {
  const seg = new Segmenter()
  const done = run('xxxxxxxxxx......').flatMap((f) => seg.push(f)) // 1 s speech, 0.6 s pause
  expect(done).toHaveLength(1)
  expect(done[0]).toHaveLength(16)
  expect(run('..........').flatMap((f) => seg.push(f))).toEqual([])
  expect(seg.flush()).toBeNull()
})

it('cuts long speech at 8 s and keeps the tail for flush, across odd chunk sizes', () => {
  const seg = new Segmenter()
  const all = run('x'.repeat(100))
  const joined = new Uint8Array(all.length * FRAME_BYTES)
  all.forEach((f, i) => joined.set(f, i * FRAME_BYTES))
  const done: Uint8Array[][] = []
  for (let at = 0; at < joined.length; at += 1000) done.push(...seg.push(joined.slice(at, at + 1000)))
  expect(done).toHaveLength(1) // 8 s
  expect(seg.flush()?.length).toBe(20) // the last 2 s
})

it('joins Chinese without spaces and Latin words with one', () => {
  expect(joinText('让 lyric', '继续跑')).toBe('让 lyric继续跑')
  expect(joinText('run the', 'tests again')).toBe('run the tests again')
  expect(joinText('', 'x')).toBe('x')
})
