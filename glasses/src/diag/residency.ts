/** The residency diagnostic (`?diag=1`): logs every ~10 s whether the page keeps running, drawing and
 *  hearing the glasses, keeps the log in the Even App's storage while the hub is unreachable, and sends it
 *  to the hub's `/v1/diagnostics` (`<state_dir>/diagnostics/g2.jsonl`) once it is back. */
import { unwrap, type HubClient } from '@/hub/client'
import type { GlassesPort } from '@/platform/port'
import { Probe, type Entry, type Link, type Scenario } from './probe'

const TICK_MS = 10_000
/** About five and a half hours of entries; the oldest go first. */
const KEEP = 2000
/** What survives a reload of the page: the last hour. */
const SAVE = 360
const BATCH = 200
const STORAGE_KEY = 'muxtower.diag'

interface BatteryManager {
  level: number
  charging: boolean
}

export const diagRequested = (search: string) => new URLSearchParams(search).get('diag') === '1'

export interface ResidencyDeps {
  /** The hub client while the link is open, else null. */
  client(): HubClient | null
  link(): Link
  onLink(listener: () => void): void
  /** A voice reply has the microphone: leave it alone. */
  talking(): boolean
  show(line: string): void
}

export class Residency {
  private readonly port: GlassesPort
  private readonly deps: ResidencyDeps
  private readonly probe = new Probe(Date.now())
  private buffer: Entry[] = []
  private sending = false
  private phone: { battery: number | null; charging: boolean | null } = { battery: null, charging: null }
  private battery: BatteryManager | null = null
  mic = false
  private imu = false
  scenario: Scenario = ''
  /** For the phone panel. */
  sent = 0
  onChange: () => void = () => undefined

  constructor(port: GlassesPort, deps: ResidencyDeps) {
    this.port = port
    this.deps = deps
  }

  get run() {
    return this.probe.run
  }

  get pending() {
    return this.buffer.length
  }

  /** The port with its draws counted (whether text still reaches the glasses). */
  instrument(port: GlassesPort): GlassesPort {
    const counted = (ok: boolean) => (this.probe.count(ok ? 'draws_ok' : 'draws_failed'), ok)
    return {
      ...port,
      create: (text, menu) => port.create(text, menu).then(counted, () => counted(false)),
      update: (text) => port.update(text).then(counted, () => counted(false)),
    }
  }

  async start() {
    try {
      const saved = JSON.parse((await this.port.getItem(STORAGE_KEY)) ?? '[]') as Entry[]
      if (Array.isArray(saved)) this.buffer = saved
    } catch {
      // Nothing saved, or unreadable: start empty.
    }
    this.port.onEvent((event) => this.probe.event(event))
    this.port.onDevice((device) => this.probe.deviceChanged(device))
    // Not every host has head motion (the simulator does not): the log says whether it is on.
    this.imu = await this.port.startImu().catch(() => false)
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }
    this.battery = await nav.getBattery?.().catch(() => null) ?? null
    document.addEventListener('visibilitychange', () => this.probe.count('vis_changes'))
    document.addEventListener('freeze', () => this.probe.count('freezes'))
    document.addEventListener('resume', () => this.probe.count('resumes'))
    this.deps.onLink(() => this.probe.linkChanged(this.deps.link(), Date.now()))
    this.probe.linkChanged(this.deps.link(), Date.now())
    setInterval(() => void this.tick(), TICK_MS)
    this.deps.show(this.line())
  }

  async setMic(on: boolean) {
    this.mic = on
    if (this.deps.talking()) return this.onChange()
    if (on) await this.port.startAudio().catch(() => false)
    else await this.port.stopAudio().catch(() => undefined)
    this.onChange()
  }

  setScenario(scenario: Scenario) {
    this.scenario = scenario
    this.onChange()
  }

  private async tick() {
    if (this.battery) this.phone = { battery: Math.round(this.battery.level * 100), charging: this.battery.charging }
    const entry = this.probe.tick(Date.now(), {
      vis: document.visibilityState,
      mic: this.mic,
      imu_on: this.imu,
      scenario: this.scenario,
      buffered: this.buffer.length,
      phone: this.phone,
    })
    // A voice reply turns the microphone off when it ends: turn it back on for the test.
    if (this.mic && entry.audio === 0 && !this.deps.talking()) {
      this.probe.count('mic_restarts')
      void this.port.startAudio().catch(() => false)
    }
    this.buffer = [...this.buffer, entry].slice(-KEEP)
    void this.port.setItem(STORAGE_KEY, JSON.stringify(this.buffer.slice(-SAVE))).catch(() => undefined)
    await this.flush()
    this.deps.show(this.line())
    this.onChange()
  }

  private async flush() {
    const client = this.deps.client()
    if (!client || this.sending) return
    this.sending = true
    try {
      while (this.buffer.length) {
        const batch = this.buffer.slice(0, BATCH)
        unwrap(await client.POST('/v1/diagnostics', { body: { source: 'g2', entries: batch } }))
        this.buffer = this.buffer.slice(batch.length)
        this.sent += batch.length
      }
      void this.port.setItem(STORAGE_KEY, '[]').catch(() => undefined)
    } catch {
      // The hub is unreachable (or says no): keep the entries for the next tick.
    } finally {
      this.sending = false
    }
  }

  /** One line on the glasses: proof the page still runs and draws. */
  private line() {
    // Changes every tick, so every tick is a real draw (and counted as one).
    const up = Math.round((Date.now() - this.probe.run) / 1000)
    const clock = `${Math.floor(up / 60)}:${String(up % 60).padStart(2, '0')}`
    return `diag ${clock}${this.mic ? ' · mic' : ''}${this.scenario ? ` · ${this.scenario}` : ''} · ${this.buffer.length} queued`
  }
}
