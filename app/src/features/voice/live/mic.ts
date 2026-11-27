import { useLiveAudio, type MicSource } from './audio-prefs'
import { logMedia } from './media-log'
import { useAudioStatus } from './status'

/**
 * The microphone Live listens on, opened for the VAD (`engine.ts` hands `openMic` to MicVAD as its
 * `getStream` and `resumeStream`): the one chosen (`audio-prefs.ts`) among the devices the browser lists,
 * with voice processing on or off.
 *
 * A browser names its devices only once the microphone is allowed (Chrome on Android: "Speakerphone",
 * "Headset earpiece", "Bluetooth headset"…): until then the default is opened first, which asks, and the
 * list is read again. A Bluetooth one is told by its name, or by sharing its group with a Bluetooth output.
 * When the one chosen is not there (or will not open), the default is used and the status says so.
 */

/** What `enumerateDevices` lists, as far as the choice needs it. */
export type Device = Pick<MediaDeviceInfo, 'deviceId' | 'groupId' | 'kind' | 'label'>

export interface MicChoice {
  /** The device to open; null: the browser's default. */
  deviceId: string | null
  label: string | null
  /** The source chosen has no device here: the default instead. */
  missing: boolean
}

const BLUETOOTH = /bluetooth|hands-?free|\bbt\b|\bsco\b|\bhfp\b|\bcar\b|airpods/i
const BUILT_IN = /built-?in|internal|speakerphone|earpiece|\bphone\b|microphone array|mic array/i
const PREFERRED_BUILT_IN = /speakerphone|built-?in|internal/i // the phone's main microphone, not the earpiece's
// Not devices but the browser's names for one: "default", and Windows' "communications".
const ALIASES = new Set(['', 'default', 'communications'])

const NAMES: Record<Exclude<MicSource, 'default'>, string> = { phone: 'Phone microphone', bluetooth: 'Bluetooth microphone' }

function isBluetooth(device: Device, all: Device[]): boolean {
  if (BLUETOOTH.test(device.label)) return true
  return !!device.groupId && all.some((d) => d.kind === 'audiooutput' && d.groupId === device.groupId && BLUETOOTH.test(d.label))
}

/** The device for a source, from what `enumerateDevices` listed. */
export function chooseMic(devices: Device[], source: MicSource): MicChoice {
  if (source === 'default') return { deviceId: null, label: null, missing: false }
  const inputs = devices.filter((d) => d.kind === 'audioinput' && !ALIASES.has(d.deviceId))
  const found =
    source === 'bluetooth'
      ? inputs.find((d) => isBluetooth(d, devices))
      : (() => {
          const builtIn = inputs.filter((d) => BUILT_IN.test(d.label) && !isBluetooth(d, devices))
          return builtIn.find((d) => PREFERRED_BUILT_IN.test(d.label)) ?? builtIn[0]
        })()
  return found ? { deviceId: found.deviceId, label: found.label, missing: false } : { deviceId: null, label: null, missing: true }
}

/** The audio constraints Live asks for: mono, voice processing on or off together, the device if one. */
export function micConstraints(deviceId: string | null, processing: boolean): MediaTrackConstraints {
  return {
    channelCount: 1,
    echoCancellation: processing,
    noiseSuppression: processing,
    autoGainControl: processing,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  }
}

const labelled = (devices: Device[]) => devices.some((d) => d.kind === 'audioinput' && d.label)
const release = (stream: MediaStream | null) => stream?.getTracks().forEach((t) => t.stop())

/** Opens the microphone chosen (the default when it is not here), and says which one is in use. */
export async function openMic(): Promise<MediaStream> {
  const { mic, processing } = useLiveAudio.getState()
  const media = navigator.mediaDevices
  const open = (deviceId: string | null) => media.getUserMedia({ audio: micConstraints(deviceId, processing) })
  let stream: MediaStream | null = null
  let note: string | null = null
  if (mic !== 'default') {
    let devices: Device[] = await media.enumerateDevices()
    if (!labelled(devices)) {
      stream = await open(null) // asks for the microphone: the devices have names after
      devices = await media.enumerateDevices()
    }
    const choice = chooseMic(devices, mic)
    if (choice.missing) note = `${NAMES[mic]} not found: using the default`
    else if (choice.deviceId && stream?.getAudioTracks()[0]?.getSettings().deviceId !== choice.deviceId) {
      release(stream)
      stream = null
      try {
        stream = await open(choice.deviceId)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotAllowedError') throw error
        note = `${NAMES[mic]} would not open: using the default`
      }
    }
  }
  stream ??= await open(null)
  report(stream, processing, note)
  return stream
}

function report(stream: MediaStream, asked: boolean, note: string | null) {
  const track = stream.getAudioTracks()[0]
  const settings = track?.getSettings?.() ?? {}
  // The media log (Live's audio route): what was applied, never the device's name.
  logMedia('mic', {
    ev: 'open',
    echoCancellation: settings.echoCancellation ?? null,
    noiseSuppression: settings.noiseSuppression ?? null,
    autoGainControl: settings.autoGainControl ?? null,
    chosen: useLiveAudio.getState().mic,
    fallback: note !== null,
  })
  useAudioStatus.setState({
    input: track?.label || 'Microphone',
    processing: typeof settings.echoCancellation === 'boolean' ? settings.echoCancellation : asked,
    note,
  })
}

/**
 * How the VAD lets the microphone go while Read aloud speaks (`engine.ts` hands these to MicVAD), and takes
 * it again. `keep()` true (Live's call path, `call-audio.ts`): it stays open, the VAD only stops listening
 * to it, so the phone stays in hands-free mode; taken again as it is while its track is live. False: as
 * vad-web does by default, its tracks stopped, and the microphone opened again after (`openMic`).
 */
export function vadStreamOptions(keep: () => boolean, open: () => Promise<MediaStream> = openMic) {
  return {
    pauseStream: async (stream: MediaStream) => {
      if (keep()) return
      release(stream)
    },
    resumeStream: async (stream: MediaStream) =>
      keep() && stream.getAudioTracks().some((t) => t.readyState === 'live') ? stream : (release(stream), open()),
  }
}

/** Live is off: no microphone in use. */
export function micClosed() {
  useAudioStatus.setState({ input: null, processing: null, note: null })
}
