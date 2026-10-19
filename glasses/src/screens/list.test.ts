import { expect, it } from 'vitest'
import { arrange, draw, move, resolveCursor, type Row } from './list'

const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id, text: id }))

it('keeps a frozen order and appends new rows as fresh', () => {
  const arranged = arrange(rows('c', 'a', 'd'), ['a', 'b', 'c'])
  expect(arranged.rows.map((r) => r.id)).toEqual(['a', 'c', 'd'])
  expect([...arranged.fresh]).toEqual(['d'])
})

it('follows ids, skips dividers and stops at the ends', () => {
  const list: Row[] = [...rows('a'), { id: 'div', text: '-', selectable: false }, ...rows('b')]
  expect(resolveCursor(list, 'gone')).toBe('a')
  expect(move(list, 'a', 1)).toBe('b')
  expect(move(list, 'b', 1)).toBe('b')
  expect(move(list, 'a', -1)).toBe('a')
})

it('pages around the cursor', () => {
  const list = rows(...'abcdefghijk')
  const window = draw(arrange(list, undefined), 'j', 8)
  expect(window).toMatchObject({ page: 2, pages: 2 })
  expect(window.lines[1].trimStart().startsWith('>')).toBe(true)
})
