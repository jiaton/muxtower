import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('the browser’s swipe navigation is off on the root and every scroller (a base rule new ones inherit)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
  expect(css).toMatch(/html,\s*body,\s*\*\s*\{\s*overscroll-behavior-x:\s*none;\s*\}/)
})
