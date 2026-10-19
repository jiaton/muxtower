import { expect, it } from 'vitest'
import { compose } from './screen'
import { LINES, MAX_TEXT_BYTES, TEXT_WIDTH } from './limits'
import { clean, columns, fit, width, wrap } from './text'

it('replaces or drops glyphs the firmware font lacks', () => {
  expect(clean('done ✓\n next ▸ step')).toBe('done ok next > step')
})

it('cuts to a pixel budget with an ellipsis', () => {
  const cut = fit('a very long session title that goes on and on', 120)
  expect(cut.endsWith('…')).toBe(true)
  expect(width(cut)).toBeLessThanOrEqual(120)
  expect(fit('short', 120)).toBe('short')
})

it('aligns columns to within a space', () => {
  const a = columns(['acme-api', 'approve'], [200], 400)
  const b = columns(['web', 'idle'], [200], 400)
  const at = (line: string, word: string) => width(line.slice(0, line.indexOf(word)))
  expect(Math.abs(at(a, 'approve') - at(b, 'idle'))).toBeLessThanOrEqual(width(' '))
})

it('wraps Latin at spaces and Chinese anywhere', () => {
  const latin = wrap('the quick brown fox jumps over the lazy dog '.repeat(4), 200)
  expect(latin.every((l) => width(l) <= 200 && !l.startsWith(' '))).toBe(true)
  expect(latin.join(' ').split(' ').every((word) => word.length > 0)).toBe(true)
  const chinese = wrap('这是一个很长的中文句子，用来测试换行是否在任意两个汉字之间发生，而且不会超过宽度。', 200)
  expect(chinese.length).toBeGreaterThan(1)
  expect(chinese.every((l) => width(l) <= 200)).toBe(true)
})

it('composes exactly one screen within the byte budget', () => {
  const body = Array.from({ length: 20 }, () => '中'.repeat(40))
  const text = compose({ header: 'h', body, footer: 'f' })
  expect(text.split('\n')).toHaveLength(LINES)
  expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(MAX_TEXT_BYTES)
  expect(text.split('\n').every((l) => width(l) <= TEXT_WIDTH)).toBe(true)
})
