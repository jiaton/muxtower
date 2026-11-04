import { describe, expect, it } from 'vitest'
import { installTabs, joinTranscript, reachList, securityList, sourceList, teamTranscript } from './lists'

describe('lists', () => {
  it('uses only example hosts in transcripts', () => {
    const hosts = JSON.stringify([joinTranscript, teamTranscript, installTabs]).match(/https:\/\/[\w.-]+/g) ?? []
    expect(hosts.every((h) => /example/.test(h))).toBe(true)
  })

  it('starts every install with pipx and ends with pairing', () => {
    for (const tab of installTabs) {
      const commands = tab.lines.filter((l) => l.kind === 'command').map((l) => l.text)
      expect(commands[0]).toBe('pipx install muxtower')
      expect(commands.at(-1)).toMatch(/^muxtower pair/)
    }
  })

  it('says one thing per item, as a sentence', () => {
    for (const item of [...sourceList, ...reachList, ...securityList]) expect(item.text).toMatch(/\.$/)
  })
})
