import { expect, it } from 'vitest'
import { PACKS, languageOf, spokenIn } from '.'

it("every language pack has Read aloud's own words, and English answers for any other", () => {
  for (const pack of PACKS) {
    for (const [word, said] of Object.entries(pack.spoken)) expect(said, `${pack.id}.${word}`).toBeTruthy()
  }
  expect(spokenIn('zh').code).toBe('一段代码')
  expect(spokenIn('zh-CN').voiceTag).toBe('zh-CN')
  expect(spokenIn('en').code).toBe('a block of code')
  expect(spokenIn('sv')).toBe(spokenIn('en')) // no pack: English
})

it("tells a text's language by its script, as the hub does", () => {
  expect(['修好了测试', 'テストを直しました', '테스트를 고쳤어요', 'Fixed the test', 'PR 212 的 CI 挂了'].map(languageOf)).toEqual([
    'zh',
    'ja',
    'ko',
    'en',
    'zh',
  ])
})
