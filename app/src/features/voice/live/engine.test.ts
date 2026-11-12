import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { ORT_VERSION, VAD_VERSION, rms, seen, wav } from './engine'

const installed = (name: string) => (JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')) as { version: string }).version

it("fetches the VAD's and ONNX Runtime's assets at the versions bundled", () => {
  expect(VAD_VERSION).toBe(installed('@ricky0123/vad-web'))
  expect(ORT_VERSION).toBe(installed('onnxruntime-web'))
})

it('encodes 16 kHz mono 16-bit WAV, and tells a quiet segment by its level', async () => {
  const audio = new Float32Array(16000).fill(0.5)
  const blob = wav(audio)
  expect(blob.type).toBe('audio/wav')
  expect(blob.size).toBe(44 + 32000)
  const head = new DataView(await blob.arrayBuffer())
  expect(String.fromCharCode(...new Uint8Array(head.buffer, 0, 4))).toBe('RIFF')
  expect(head.getUint32(24, true)).toBe(16000)
  expect(head.getInt16(44, true)).toBe(Math.floor(0.5 * 0x7fff))
  expect(rms(audio)).toBeCloseTo(0.5)
  expect(rms(new Float32Array(100))).toBe(0)
})

it('tells the same speech handed over again from new speech', () => {
  const said = Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 7) * 0.3)
  const other = Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 9) * 0.3)
  expect(seen(said)).toBe(false)
  expect(seen(other)).toBe(false)
  expect(seen(said)).toBe(true)
})
