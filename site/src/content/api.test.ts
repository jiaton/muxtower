import { describe, expect, it } from 'vitest'
import { apiIdeas, apiTranscript } from './api'

describe('api copy', () => {
  it('calls only example hosts', () => {
    for (const line of apiTranscript) for (const host of line.text.match(/https:\/\/[\w.-]+/g) ?? []) expect(host).toContain('example')
  })

  it('names a real endpoint in each idea that uses one', () => {
    for (const idea of apiIdeas) for (const path of idea.text.match(/\/v1\/[\w/{}]+/g) ?? []) expect(path).toMatch(/^\/v1\/(sessions|asr)/)
  })
})
