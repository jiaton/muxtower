import { describe, expect, it } from 'vitest'
import { questions } from './faq'

describe('faq', () => {
  it('asks each question once and answers it', () => {
    expect(new Set(questions.map((q) => q.q)).size).toBe(questions.length)
    for (const { q, a } of questions) {
      expect(q).toMatch(/\?$/)
      expect(a.length).toBeGreaterThan(20)
    }
  })
})
