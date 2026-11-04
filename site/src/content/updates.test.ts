import { describe, expect, it } from 'vitest'
import { updates, updatesTranscript } from './updates'

describe('updates copy', () => {
  it('names the three update policies', () => {
    const text = JSON.stringify([updates, updatesTranscript])
    for (const word of ['always', 'never', 'only when it must']) expect(text).toContain(word)
  })
})
