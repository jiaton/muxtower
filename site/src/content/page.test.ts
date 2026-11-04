import { describe, expect, it } from 'vitest'
import * as page from './page'

const text = JSON.stringify(page)

describe('page copy', () => {
  it('links every nav entry to a section the page has', () => {
    expect(page.nav.map((n) => n.href)).toEqual(['#hub', '#team', '#features', '#install', '#faq'])
  })

  it('keeps each lead to a sentence or two', () => {
    for (const s of [page.hero, page.hub, page.team, page.security, page.install]) expect(s.lead.length).toBeLessThanOrEqual(200)
  })

  it('names nobody and no real host (root AGENTS.md)', () => {
    expect(text).not.toMatch(/\.(dev|com|net|io)\b(?!.*example)/)
  })
})
