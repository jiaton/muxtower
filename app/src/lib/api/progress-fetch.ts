/**
 * A `fetch` for one request whose body's sending is followed (`onProgress`: bytes sent of the total), for the
 * typed client's per-request `fetch` option. fetch itself reports no upload progress (a streamed body needs
 * HTTP/2 and says only what was handed over), so this is XMLHttpRequest, answered as a `Response`. A failure
 * to reach the daemon rejects with a TypeError, as fetch does; `request.signal` aborts it.
 */
export function progressFetch(onProgress: (sent: number, total: number) => void): (request: Request) => Promise<Response> {
  return async (request) => {
    const body = request.method === 'GET' || request.method === 'HEAD' ? null : await request.blob()
    return new Promise<Response>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open(request.method, request.url)
      request.headers.forEach((value, name) => xhr.setRequestHeader(name, value))
      xhr.responseType = 'text' // the daemon answers in JSON
      xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : (body?.size ?? 0))
      xhr.onload = () => {
        const headers = new Headers()
        for (const line of xhr.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
          const at = line.indexOf(':')
          if (at > 0) headers.append(line.slice(0, at).trim(), line.slice(at + 1).trim())
        }
        // A Response cannot carry these statuses with a body; none of them has one anyway.
        const bodiless = xhr.status === 204 || xhr.status === 205 || xhr.status === 304
        resolve(new Response(bodiless ? null : xhr.responseText, { status: xhr.status, statusText: xhr.statusText, headers }))
      }
      xhr.onerror = () => reject(new TypeError('Failed to fetch'))
      xhr.ontimeout = () => reject(new TypeError('Failed to fetch'))
      const aborted = () => reject(new DOMException('The upload was stopped.', 'AbortError'))
      xhr.onabort = aborted
      if (request.signal.aborted) return aborted()
      request.signal.addEventListener('abort', () => xhr.abort(), { once: true })
      xhr.send(body)
    })
  }
}
