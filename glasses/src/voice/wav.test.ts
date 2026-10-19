import { expect, it } from 'vitest'
import { pcmSeconds, pcmToWav } from './wav'

it('wraps PCM chunks in a 16 kHz mono 16-bit WAV header', () => {
  const wav = pcmToWav([new Uint8Array([1, 2]), new Uint8Array([3, 4])])
  const view = new DataView(wav.buffer)
  expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF')
  expect(new TextDecoder().decode(wav.slice(8, 12))).toBe('WAVE')
  expect(view.getUint32(24, true)).toBe(16000)
  expect(view.getUint16(34, true)).toBe(16)
  expect(view.getUint32(40, true)).toBe(4)
  expect(Array.from(wav.slice(44))).toEqual([1, 2, 3, 4])
  expect(pcmSeconds(32000)).toBe(1)
})
