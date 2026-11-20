import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('the browser’s swipe navigation is off on the root and every scroller (a base rule new ones inherit)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
  expect(css).toMatch(/html,\s*body,\s*\*\s*\{\s*overscroll-behavior-x:\s*none;\s*\}/)
})

it('…but not on a box that only clips: a truncated label must not end the scroll chain of the row it is in', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
  const rule = css.match(/([^{}]*)\{\s*overscroll-behavior-x:\s*auto;\s*\}/)
  expect(rule?.[1]).toMatch(/\.truncate\b/)
  expect(rule?.[1]).toMatch(/\.overflow-hidden\b/)
  expect(rule?.[1]).toMatch(/\.line-clamp-2\b/)
})
