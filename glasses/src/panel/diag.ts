/** The residency diagnostic's controls on the phone panel (`?diag=1` only): the microphone stream, and
 *  which test scenario is running, so the log can be read per scenario. */
import { SCENARIOS, type Scenario } from '@/diag/probe'
import type { Residency } from '@/diag/residency'

export function mountDiag(root: HTMLElement, residency: Residency) {
  const status = document.createElement('p')
  status.className = 'muted'
  const mic = document.createElement('button')
  mic.type = 'button'
  mic.onclick = () => void residency.setMic(!residency.mic)
  const scenarios = document.createElement('div')
  scenarios.className = 'row'
  const buttons = ['', ...SCENARIOS].map((scenario) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = scenario || 'none'
    button.onclick = () => residency.setScenario(scenario as Scenario)
    return button
  })
  scenarios.append(...buttons)
  const card = document.createElement('section')
  card.className = 'card'
  const title = document.createElement('p')
  title.textContent = 'Residency diagnostic'
  const row = document.createElement('div')
  row.className = 'row'
  row.append(mic)
  card.append(title, status, row, scenarios)
  root.prepend(card)
  const update = () => {
    mic.textContent = residency.mic ? 'Mic stream: on' : 'Mic stream: off'
    buttons.forEach((b) => b.classList.toggle('primary', (b.textContent === 'none' ? '' : b.textContent) === residency.scenario))
    status.textContent = `Run ${new Date(residency.run).toLocaleTimeString()} · scenario ${residency.scenario || 'none'} · ${residency.sent} sent, ${residency.pending} queued`
  }
  residency.onChange = update
  update()
}
