/** The residency diagnostic's counters: what happened to the page in each ~10 s interval. Entries are
 *  built from this fixed set of keys only (counters, states, timestamps): never audio, text or names. */
import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import type { DeviceState } from '@/platform/port'

/** Marks the owner taps on the phone panel, one per test scenario. */
export const SCENARIOS = ['a', 'b', 'c', 'd', 'e'] as const
export type Scenario = (typeof SCENARIOS)[number] | ''

export type Link = 'connecting' | 'open' | 'down' | 'rejected' | 'unpaired'

export type Entry = {
  t: number
  run: number
  seq: number
  up_s: number
  /** How long this interval really took (a suspended page shows a long one). */
  gap_ms: number
  vis: string
  vis_changes: number
  freezes: number
  resumes: number
  link: Link
  drops: number
  reconnects: number
  /** Time the link was down within this interval. */
  down_ms: number
  /** Length of each outage that ended in this interval. */
  outages_ms: number[]
  imu: number
  audio: number
  audio_bytes: number
  draws_ok: number
  draws_failed: number
  covered: number
  uncovered: number
  exits: number
  device_changes: number
  connected: boolean | null
  wearing: boolean | null
  in_case: boolean | null
  charging: boolean | null
  battery: number | null
  phone_battery: number | null
  phone_charging: boolean | null
  mic: boolean
  imu_on: boolean
  mic_restarts: number
  scenario: Scenario
  buffered: number
}

type Counter = 'vis_changes' | 'freezes' | 'resumes' | 'drops' | 'reconnects' | 'imu' | 'audio' | 'audio_bytes'
  | 'draws_ok' | 'draws_failed' | 'covered' | 'uncovered' | 'exits' | 'device_changes' | 'mic_restarts'

const zero = (): Record<Counter, number> => ({
  vis_changes: 0, freezes: 0, resumes: 0, drops: 0, reconnects: 0, imu: 0, audio: 0, audio_bytes: 0,
  draws_ok: 0, draws_failed: 0, covered: 0, uncovered: 0, exits: 0, device_changes: 0, mic_restarts: 0,
}) // prettier-ignore

export interface Context {
  vis: string
  mic: boolean
  imu_on: boolean
  scenario: Scenario
  buffered: number
  phone: { battery: number | null; charging: boolean | null }
}

export class Probe {
  readonly run: number
  private seq = 0
  private last: number
  private counts = zero()
  private link: Link = 'unpaired'
  private downSince: number | null = null
  private downMs = 0
  private outages: number[] = []
  private device: DeviceState | null = null

  constructor(now: number) {
    this.run = now
    this.last = now
  }

  count(counter: Counter, by = 1) {
    this.counts[counter] += by
  }

  /** A raw SDK event: head motion, microphone audio, or the page being covered or closed. */
  event(event: EvenHubEvent) {
    if (event.audioEvent) {
      this.count('audio')
      this.count('audio_bytes', event.audioEvent.audioPcm?.length ?? 0)
      return
    }
    const sys = event.sysEvent
    if (!sys) return
    if (sys.imuData) return this.count('imu')
    const type = OsEventTypeList.fromJson(sys.eventType)
    if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) this.count('covered')
    else if (type === OsEventTypeList.FOREGROUND_EXIT_EVENT) this.count('uncovered')
    else if (type === OsEventTypeList.ABNORMAL_EXIT_EVENT || type === OsEventTypeList.SYSTEM_EXIT_EVENT) this.count('exits')
    else if (type === OsEventTypeList.IMU_DATA_REPORT) this.count('imu')
  }

  linkChanged(link: Link, now: number) {
    if (link === this.link) return
    const wasOpen = this.link === 'open'
    if (link === 'open' && this.downSince !== null) {
      this.close(now)
      this.count('reconnects')
    } else if (wasOpen && link !== 'open') {
      this.count('drops')
      this.downSince = now
    }
    this.link = link
  }

  deviceChanged(device: DeviceState) {
    this.device = device
    this.count('device_changes')
  }

  /** The interval's entry; the counters start again. */
  tick(now: number, context: Context): Entry {
    if (this.downSince !== null) {
      this.downMs += now - Math.max(this.downSince, this.last)
    }
    const entry: Entry = {
      t: now,
      run: this.run,
      seq: this.seq++,
      up_s: Math.round((now - this.run) / 1000),
      gap_ms: now - this.last,
      vis: context.vis,
      ...this.counts,
      link: this.link,
      down_ms: this.downMs,
      outages_ms: this.outages,
      connected: this.device?.connected ?? null,
      wearing: this.device?.wearing ?? null,
      in_case: this.device?.inCase ?? null,
      charging: this.device?.charging ?? null,
      battery: this.device?.battery ?? null,
      phone_battery: context.phone.battery,
      phone_charging: context.phone.charging,
      mic: context.mic,
      imu_on: context.imu_on,
      scenario: context.scenario,
      buffered: context.buffered,
    }
    this.counts = zero()
    this.downMs = 0
    this.outages = []
    this.last = now
    return entry
  }

  private close(now: number) {
    const since = this.downSince ?? now
    this.outages.push(now - since)
    this.downMs += now - Math.max(since, this.last)
    this.downSince = null
  }
}
