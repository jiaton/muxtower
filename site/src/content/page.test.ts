import { describe, expect, it } from 'vitest'
import * as page from './page'

const text = JSON.stringify(page)

describe('page copy', () => {
  it('links every nav entry to a section the page has', () => {
    expect(page.nav.map((n) => n.href)).toEqual(['#demo', '#hub', '#team', '#install', '#faq'])
  })

  it('numbers its sections in order', () => {
    const labels = [page.hub, page.team, page.sources, page.reach, page.security, page.install].map((s) => s.label)
    expect(labels).toEqual(['01', '02', '03', '04', '05', '06'])
  })

  it('names nobody and no real host (root AGENTS.md)', () => {
    expect(text).not.toMatch(/\.(dev|com|net|io)\b(?!.*example)/)
  })
})
