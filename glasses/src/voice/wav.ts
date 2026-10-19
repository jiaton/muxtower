/** The glasses microphone's PCM (16 kHz, mono, signed 16-bit little-endian) as a WAV file. */

export const SAMPLE_RATE = 16_000
const HEADER_BYTES = 44

export function pcmToWav(chunks: Uint8Array[], sampleRate = SAMPLE_RATE): Uint8Array<ArrayBuffer> {
  const dataBytes = chunks.reduce((n, c) => n + c.length, 0)
  const wav = new Uint8Array(HEADER_BYTES + dataBytes)
  const view = new DataView(wav.buffer)
  const ascii = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)
  let at = HEADER_BYTES
  for (const chunk of chunks) {
    wav.set(chunk, at)
    at += chunk.length
  }
  return wav
}

/** Seconds of audio in `bytes` of PCM. */
export const pcmSeconds = (bytes: number, sampleRate = SAMPLE_RATE) => bytes / (sampleRate * 2)
