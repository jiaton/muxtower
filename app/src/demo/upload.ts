/**
 * Files attached to a message, in the demo: `POST /v1/sessions/{id}/attachments` answered as the daemon does
 * (201 with where it lies, 413 past the size limit, 409 where a session takes pictures only), its bytes
 * "sent" at a made-up speed so the upload's progress shows. The app sends them with XMLHttpRequest (fetch
 * reports no upload progress), so the demo answers those requests for its daemon too, as it does fetch.
 */
import type { Attachment } from '@/lib/api/types'
import { HOME } from './scenes/session'
import type { World } from './world'

export const MAX_MB = 25
const BYTES_PER_MS = 2_500 // 2.5 MB/s: a photo a moment, a big file a few seconds
const TICK_MS = 100

const PATHS = new WeakMap<World, Map<string, string>>()

/** Where the files a message names lie: put ahead of its words, as the daemon pastes them. */
export function withAttachments(world: World, text: string | null, ids: unknown): string | null {
  const known = PATHS.get(world)
  const paths = (Array.isArray(ids) ? ids : []).flatMap((id) => known?.get(String(id)) ?? [])
  return paths.length ? [...paths, text ?? ''].join(' ').trim() : text
}

type Answer = { status: number; body: unknown }

/** The daemon's answer to an upload of `size` bytes named `name` to session `id`. */
function answer(world: World, id: string, name: string, type: string, size: number): Answer {
  const session = world.session(id)
  if (!session) return { status: 404, body: { detail: 'no such session' } }
  if (session.source === 'remote_control') return { status: 409, body: { detail: 'this session takes pictures only' } }
  if (size > MAX_MB * 1_000_000) return { status: 413, body: { detail: `larger than ${MAX_MB} MB`, max_mb: MAX_MB } }
  const n = (PATHS.get(world)?.size ?? 0) + 1
  const safe = name.replace(/[^\w.\- ]+/g, '_') || 'file'
  const attachment: Attachment = {
    id: `att-${n}`, name: safe, size, media_type: type || 'application/octet-stream',
    path: `${HOME}/.muxtower/attachments/${n}/${safe}`,
  } // prettier-ignore
  const known = PATHS.get(world) ?? new Map<string, string>()
  known.set(attachment.id, attachment.path)
  PATHS.set(world, known)
  return { status: 201, body: attachment }
}

/** Answers the XMLHttpRequests for the demo daemon (`mine`); any other goes out as usual. */
export function installUploads(world: World, mine: (url: string) => boolean) {
  const Out = globalThis.XMLHttpRequest
  class DemoXHR extends Out {
    #to: { method: string; url: string; headers: Headers } | null = null
    #done: { status: number; body: string } | null = null
    #timer: ReturnType<typeof setInterval> | undefined

    override open(method: string, url: string | URL, ...rest: [boolean?, string?, string?]) {
      if (!mine(String(url))) return super.open(method, url, rest[0] ?? true, rest[1], rest[2])
      this.#to = { method, url: String(url), headers: new Headers() }
    }
    override setRequestHeader(name: string, value: string) {
      if (this.#to) this.#to.headers.set(name, value)
      else super.setRequestHeader(name, value)
    }
    override get status() {
      return this.#done ? this.#done.status : super.status
    }
    override get statusText() {
      return this.#done ? '' : super.statusText
    }
    override get response() {
      return this.#done ? this.#done.body : super.response
    }
    override get responseText() {
      return this.#done ? this.#done.body : super.responseText
    }
    override getAllResponseHeaders() {
      return this.#done ? 'content-type: application/json\r\n' : super.getAllResponseHeaders()
    }
    override abort() {
      if (!this.#to) return super.abort()
      clearInterval(this.#timer)
      this.dispatchEvent(new ProgressEvent('abort'))
    }
    override send(body?: Document | XMLHttpRequestBodyInit | null) {
      const to = this.#to
      if (!to) return super.send(body)
      const size = body instanceof Blob ? body.size : 0
      const match = /\/v1\/sessions\/([^/]+)\/attachments$/.exec(new URL(to.url).pathname)
      const name = decodeURIComponent(to.headers.get('X-Muxtower-Filename') ?? '')
      const reply = match
        ? answer(world, decodeURIComponent(match[1]!), name, to.headers.get('Content-Type') ?? '', size)
        : { status: 409, body: { detail: 'Not part of the demo: on your own daemon this works.' } }
      const finish = () => {
        clearInterval(this.#timer)
        this.#done = { status: reply.status, body: JSON.stringify(reply.body) }
        this.dispatchEvent(new ProgressEvent('load'))
      }
      if (reply.status !== 201) return void setTimeout(finish, 300) // refused before the bytes go
      let sent = 0
      this.#timer = setInterval(() => {
        sent = Math.min(size, sent + BYTES_PER_MS * TICK_MS)
        this.upload.dispatchEvent(new ProgressEvent('progress', { loaded: sent, total: size, lengthComputable: true }))
        if (sent >= size) finish()
      }, TICK_MS)
    }
  }
  globalThis.XMLHttpRequest = DemoXHR
}
