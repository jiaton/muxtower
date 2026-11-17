import { expect, it } from 'vitest'
import { effective, render } from './playbook'

const shared = { scope: 'shared', mode: 'add' as const, version: 3, text: '- one\n- two' }
const web = { scope: 'projects/acme/web', mode: 'add' as const, version: 1, text: '- three' }

it('reads as my_team shows it: each part marked where it comes from', () => {
  expect(render(effective(shared, web))).toBe(
    "Team playbook (the owner's: how their teams work; follow it):\n— shared (v3) —\n- one\n- two\n— acme/web adds (v1) —\n- three",
  )
  const own = { ...web, mode: 'replace' as const }
  expect(effective(shared, own)).toEqual([own]) // replaces the shared one
  expect(render(effective(shared, own))).toContain('— acme/web replaces the shared one (v1) —')
  expect(render(effective({ ...shared, text: '' }, null))).toBe('') // none: nothing said
})

it('is cut at a line past the inline size, saying what is left', () => {
  const long = { ...shared, text: Array.from({ length: 80 }, (_, i) => `- habit ${i} of the team, kept short`).join('\n') }
  const shown = render([long])
  expect(shown.length).toBeLessThan(1600)
  expect(shown).toMatch(/… \d+ more lines: read_playbook for all of it$/)
  expect(render([long], null)).toContain('habit 79')
})
