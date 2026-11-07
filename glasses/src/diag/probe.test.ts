import { OsEventTypeList, Sys_ItemEvent } from '@evenrealities/even_hub_sdk'
import { describe, expect, it } from 'vitest'
import { Probe, type Context } from './probe'

const context: Context = { vis: 'visible', mic: false, imu_on: true, scenario: 'a', buffered: 0, phone: { battery: 80, charging: false } }

describe('residency probe', () => {
  it('counts an interval and starts again', () => {
    const probe = new Probe(0)
    probe.event({ audioEvent: { audioPcm: new Uint8Array(640) } as never })
    probe.event({ sysEvent: new Sys_ItemEvent({ imuData: { x: 0, y: 0, z: 1 } as never }) })
    probe.event({ sysEvent: new Sys_ItemEvent({ eventType: OsEventTypeList.FOREGROUND_ENTER_EVENT }) })
    probe.count('draws_ok')
    probe.deviceChanged({ connected: true, wearing: true, battery: 70 })
    const first = probe.tick(10_000, context)
    expect(first).toMatchObject({ seq: 0, up_s: 10, gap_ms: 10_000, audio: 1, audio_bytes: 640, imu: 1, covered: 1, draws_ok: 1 })
    expect(first).toMatchObject({ wearing: true, battery: 70, phone_battery: 80, scenario: 'a' })
    const second = probe.tick(45_000, context)
    expect(second).toMatchObject({ seq: 1, gap_ms: 35_000, audio: 0, imu: 0, battery: 70 })
  })

  it('measures outages across intervals', () => {
    const probe = new Probe(0)
    probe.linkChanged('connecting', 0)
    probe.linkChanged('open', 1000)
    probe.linkChanged('down', 6000)
    const during = probe.tick(10_000, context)
    expect(during).toMatchObject({ link: 'down', drops: 1, down_ms: 4000, reconnects: 0, outages_ms: [] })
    probe.linkChanged('connecting', 12_000)
    probe.linkChanged('open', 13_000)
    const after = probe.tick(20_000, context)
    expect(after).toMatchObject({ link: 'open', drops: 0, reconnects: 1, down_ms: 3000, outages_ms: [7000] })
  })

  it('keeps entries to its fixed keys', () => {
    const keys = Object.keys(new Probe(0).tick(1, context)).sort()
    expect(keys).toMatchSnapshot()
  })
})
