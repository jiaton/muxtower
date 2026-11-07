import { GlassesApp } from './app'
import { Residency, diagRequested } from './diag/residency'
import { loadHubConfig } from './hub/config'
import { mountDiag } from './panel/diag'
import { mountPanel } from './panel/panel'
import { connectEven, insideEvenApp as insideEvenAppNow } from './platform/even'
import type { GlassesPort } from './platform/port'
import { PREVIEW_INPUTS, createPreview } from './platform/preview'
import { createAppStore } from './state/store'

const BRIDGE_WAIT_MS = 1500
const BRIDGE_POLL_MS = 50

/** The Even App (and its simulator) inject `flutter_inappwebview` into the page, possibly a moment after
 *  load; a plain browser never has it. (The SDK's own wait resolves either way.) */
async function insideEvenApp(): Promise<boolean> {
  for (let waited = 0; waited < BRIDGE_WAIT_MS; waited += BRIDGE_POLL_MS) {
    if (insideEvenAppNow()) return true
    await new Promise((resolve) => setTimeout(resolve, BRIDGE_POLL_MS))
  }
  return insideEvenAppNow()
}

async function main() {
  const root = document.getElementById('panel')!
  const [config, onGlasses] = await Promise.all([loadHubConfig(), insideEvenApp()])
  const panel = mountPanel(root, !onGlasses)
  let port: GlassesPort
  if (onGlasses) {
    port = await connectEven()
  } else {
    const preview = createPreview(panel.screen, panel.menu)
    port = preview.port
    for (const [name, make] of Object.entries(PREVIEW_INPUTS)) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = name
      button.onclick = () => preview.emit(make())
      panel.controls.append(button)
    }
  }
  const store = createAppStore()
  let residency: Residency | null = null
  let app: GlassesApp | null = null
  if (diagRequested(location.search)) {
    residency = new Residency(port, {
      client: () => app?.openClient ?? null,
      link: () => store.getState().link,
      onLink: (listener) => store.subscribe((state, before) => state.link !== before.link && listener()),
      talking: () => store.getState().voice !== null,
      show: (line) => store.setState({ diag: line }),
    })
    port = residency.instrument(port)
  }
  app = new GlassesApp(port, config, store)
  panel.bind(app, store)
  await app.start()
  if (residency) {
    await residency.start()
    mountDiag(root, residency)
  }
}

void main()
