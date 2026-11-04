import { describe, expect, it } from 'vitest'
import { assistant, assistantTranscript } from './assistant'

describe('assistant copy', () => {
  it('shows an event as muxtower writes it', () => {
    expect(assistantTranscript.some((l) => l.text.startsWith('[muxtower event #'))).toBe(true)
  })

  it('names the setting that turns it on', () => {
    expect(assistant.lead).toContain('`[concierge] enabled`')
  })
})
