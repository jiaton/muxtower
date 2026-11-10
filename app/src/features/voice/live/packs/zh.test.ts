import { describe, expect, it } from 'vitest'
import { commandIn, trailingSend } from '../commands'
import { keywordsFor } from '../kws'
import { zh } from './zh'

const packs = [zh]

describe('the Mandarin pack', () => {
  it('a segment that is only a command, fillers and punctuation aside, and as it is misheard', () => {
    expect(commandIn('发送。', packs)).toBe('send')
    expect(commandIn('嗯，发送', packs)).toBe('send')
    expect(commandIn('暂停', packs)).toBe('pause')
    expect(commandIn('撤回上一句。', packs)).toBe('undo')
    expect(commandIn('清空', packs)).toBe('clear')
    expect(commandIn('请发送这个', packs)).toBeNull() // more than the command: text
    expect(commandIn('Façam!', packs)).toBe('send') // a one-word clip heard as another language
    expect(commandIn('发松', packs)).toBe('send')
    expect(commandIn('站停。', packs)).toBe('pause')
  })

  it('send may trail a sentence, with no space before it; the joining word goes with it', () => {
    expect(trailingSend('修一下这个测试，发送。', packs)).toBe('修一下这个测试')
    expect(trailingSend('修一下测试，然后发送', packs)).toBe('修一下测试')
    expect(trailingSend('先暂停一下', packs)).toBeNull()
    expect(trailingSend('发送', packs)).toBeNull() // nothing before it
  })

  it('its keywords for the spotter', () => {
    const labels = keywordsFor(['zh']).map((k) => k.label)
    expect(labels).toContain('send:zh')
    expect(labels).not.toContain('send:en')
  })
})
