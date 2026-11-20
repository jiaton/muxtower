import { afterEach, beforeEach, expect, it } from 'vitest'
import { useLiveAudio } from './audio-prefs'
import { chooseMic, micClosed, micConstraints, openMic, type Device } from './mic'
import { useAudioStatus } from './status'

// What Chrome on Android lists once the microphone is allowed, plus a car's hands-free (made up).
const DEVICES: Device[] = [
  { kind: 'audioinput', deviceId: 'default', groupId: 'g0', label: 'Default' },
  { kind: 'audioinput', deviceId: 'ear', groupId: 'g1', label: 'Headset earpiece' },
  { kind: 'audioinput', deviceId: 'spk', groupId: 'g1', label: 'Speakerphone' },
  { kind: 'audioinput', deviceId: 'bt', groupId: 'g2', label: 'Bluetooth headset' },
  { kind: 'audiooutput', deviceId: 'out', groupId: 'g2', label: 'Bluetooth headset' },
]

it("picks the phone's own microphone (not the earpiece's), or the Bluetooth one, never the default alias", () => {
  expect(chooseMic(DEVICES, 'default')).toEqual({ deviceId: null, label: null, missing: false })
  expect(chooseMic(DEVICES, 'phone')).toEqual({ deviceId: 'spk', label: 'Speakerphone', missing: false })
  expect(chooseMic(DEVICES, 'bluetooth')).toEqual({ deviceId: 'bt', label: 'Bluetooth headset', missing: false })
})

it('tells a Bluetooth microphone by the output it shares a group with, when its own name says nothing', () => {
  const devices: Device[] = [
    { kind: 'audioinput', deviceId: 'mic', groupId: 'a', label: 'Built-in Microphone' },
    { kind: 'audioinput', deviceId: 'car', groupId: 'b', label: 'Hands-Free AG Audio' },
    { kind: 'audioinput', deviceId: 'x1', groupId: 'c', label: 'Acme X1' },
    { kind: 'audiooutput', deviceId: 'o', groupId: 'c', label: 'Acme X1 (Bluetooth)' },
  ]
  expect(chooseMic(devices, 'bluetooth').deviceId).toBe('car')
  expect(
    chooseMic(
      devices.filter((d) => d.deviceId !== 'car'),
      'bluetooth',
    ).deviceId,
  ).toBe('x1')
  expect(chooseMic(devices, 'phone').deviceId).toBe('mic')
})

it('says when the source chosen has no device here', () => {
  const noBluetooth = DEVICES.filter((d) => d.groupId !== 'g2')
  expect(chooseMic(noBluetooth, 'bluetooth')).toEqual({ deviceId: null, label: null, missing: true })
  expect(chooseMic([], 'phone').missing).toBe(true)
})

it('asks for voice processing on or off, all three together, and the device when one', () => {
  expect(micConstraints(null, true)).toEqual({ channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true })
  expect(micConstraints('bt', false)).toEqual({
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    deviceId: { exact: 'bt' },
  })
})

// --- opening it -------------------------------------------------------------------------------------------

const asked: MediaTrackConstraints[] = []
let allowed = false
const stopped: string[] = []

function streamOf(c: MediaTrackConstraints): MediaStream {
  const id = (c.deviceId as { exact?: string } | undefined)?.exact ?? 'default'
  const label = DEVICES.find((d) => d.deviceId === id)!.label
  const track = { label, stop: () => stopped.push(id), getSettings: () => ({ deviceId: id, echoCancellation: c.echoCancellation }) }
  return { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream
}

beforeEach(() => {
  asked.length = 0
  stopped.length = 0
  allowed = false
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      // No names until the microphone is allowed, as browsers do.
      enumerateDevices: async () => (allowed ? DEVICES : DEVICES.map((d) => ({ ...d, label: '' }))),
      getUserMedia: async ({ audio }: { audio: MediaTrackConstraints }) => {
        asked.push(audio)
        allowed = true
        return streamOf(audio)
      },
    },
  })
})
afterEach(() => {
  useLiveAudio.setState({ mic: 'default', processing: true, nextTrack: 'read' })
  micClosed()
})

it('opens the Bluetooth microphone, asking first for the default so the devices have names', async () => {
  useLiveAudio.setState({ mic: 'bluetooth', processing: false })
  await openMic()
  expect(asked.map((c) => (c.deviceId as { exact: string } | undefined)?.exact ?? null)).toEqual([null, 'bt'])
  expect(asked.every((c) => c.echoCancellation === false && c.noiseSuppression === false && c.autoGainControl === false)).toBe(true)
  expect(stopped).toEqual(['default']) // the first one let go
  expect(useAudioStatus.getState()).toMatchObject({ input: 'Bluetooth headset', processing: false, note: null })
  await openMic() // again, after Read aloud spoke: the names are known now
  expect((asked.at(-1)!.deviceId as { exact: string }).exact).toBe('bt')
  expect(asked).toHaveLength(3)
})

it('falls back to the default when the one chosen is not here, and says so', async () => {
  allowed = true
  useLiveAudio.setState({ mic: 'bluetooth' })
  const devices = DEVICES.filter((d) => d.groupId !== 'g2')
  ;(navigator.mediaDevices as { enumerateDevices: () => Promise<Device[]> }).enumerateDevices = async () => devices
  await openMic()
  expect(asked).toEqual([micConstraints(null, true)])
  expect(useAudioStatus.getState()).toMatchObject({
    input: 'Default',
    processing: true,
    note: 'Bluetooth microphone not found: using the default',
  })
})

it('the default: opened as it is, with voice processing as set', async () => {
  await openMic()
  expect(asked).toEqual([micConstraints(null, true)])
  micClosed()
  expect(useAudioStatus.getState().input).toBeNull()
})
