import { describe, expect, it } from 'vitest'
import { installTabs, securityList } from './lists'

describe('lists', () => {
  it('uses only example hosts in transcripts', () => {
    const hosts = JSON.stringify(installTabs).match(/https:\/\/[\w.-]+/g) ?? []
    expect(hosts.every((h) => /example/.test(h))).toBe(true)
  })

  it('installs with pipx and ends every way in with pairing', () => {
    for (const tab of installTabs) {
      const commands = tab.lines.filter((l) => l.kind === 'command').map((l) => l.text)
      expect(commands).toContain('pipx install muxtower')
      expect(commands.at(-1)).toMatch(/^muxtower pair/)
    }
  })

  it('says one thing per item, as a sentence', () => {
    for (const item of securityList) expect(item.text).toMatch(/\.$/)
  })
})
