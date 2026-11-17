import { expect, it } from 'vitest'
import { en } from './en'
import vocabulary from './model-tokens.json'
import { zh } from './zh'

// The spotter's model (sherpa-onnx kws zipformer zh-en 3M, the commit `kws.ts` loads) knows only these
// tokens (its tokens.txt): one it does not would fail it as it loads, and every command on the device with it.
const known = new Set<string>(vocabulary)

it("every command's and decoy's tokens are the model's", () => {
  for (const pack of [zh, en]) {
    const all = [...Object.values(pack.tokens).flat(), ...pack.decoys]
    for (const tokens of all) for (const t of tokens) expect(known.has(t), `${pack.id}: ${t}`).toBe(true)
  }
  expect(Object.keys(zh.tokens)).toEqual(expect.arrayContaining(['stop', 'repeat', 'read']))
})
