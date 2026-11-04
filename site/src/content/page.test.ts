import { describe, expect, it } from 'vitest'
import { api } from './api'
import { assistant } from './assistant'
import * as page from './page'
import { updates } from './updates'
import { usage } from './usage'

const text = JSON.stringify(page)

describe('page copy', () => {
  it('links every nav entry to a section the page has', () => {
    expect(page.nav.map((n) => n.href)).toEqual(['#demo', '#hub', '#team', '#assistant', '#api', '#install', '#faq'])
  })

  it('numbers its sections in order', () => {
    const labels = [page.hub, page.team, assistant, page.sources, page.reach, api, usage, updates, page.security, page.install]
    expect(labels.map((s) => s.label)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'])
  })

  it('names nobody and no real host (root AGENTS.md)', () => {
    expect(text).not.toMatch(/\.(dev|com|net|io)\b(?!.*example)/)
  })
})
