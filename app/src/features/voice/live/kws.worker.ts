/// <reference lib="webworker" />
import { createKeywordSpotter, initKWSModule, type KeywordEntry, type KeywordSpotter } from '@sherpaw/kws/core'
import { loadData, type DataMetadata } from '@sherpaw/preloader'

/**
 * Live mode's keyword spotter, in its own Worker: sherpa-onnx's KWS (zipformer, zh+en) in WebAssembly.
 * `init` loads the model pack into the module's files and builds the spotter; each `spot` runs it over one
 * short segment from scratch and answers with the labels heard. The page terminates the Worker to free it
 * all (the module, its memory, the model).
 */

type Request =
  | { kind: 'init'; data: ArrayBuffer; metadata: DataMetadata; keywords: KeywordEntry[] }
  | { kind: 'spot'; id: number; samples: Float32Array; rate: number }

let spotter: KeywordSpotter | null = null

self.onmessage = async (e: MessageEvent<Request>) => {
  const req = e.data
  try {
    if (req.kind === 'init') {
      const module = await initKWSModule()
      loadData({ module, data: req.data, metadata: req.metadata })
      spotter = createKeywordSpotter(module, {
        model: { encoder: '/encoder.onnx', decoder: '/decoder.onnx', joiner: '/joiner.onnx', tokens: '/tokens.txt' },
        keywords: req.keywords,
      })
      self.postMessage({ kind: 'ready' })
    } else if (spotter) {
      spotter.reset()
      // A second of silence after it, so a keyword at its very end is decided too.
      const padded = new Float32Array(req.samples.length + req.rate)
      padded.set(req.samples)
      const hits = spotter.processAudio(padded, req.rate)
      self.postMessage({ kind: 'spot', id: req.id, labels: hits.map((h) => h.label) })
    }
  } catch (error) {
    self.postMessage({ kind: 'error', id: 'id' in req ? req.id : undefined, message: String(error) })
  }
}
