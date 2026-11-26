import type { World } from './world'
import billingBefore from './assets/billing-before.png?url'
import billingVat from './assets/billing-vat.png?url'
import upgradeFlow from './assets/upgrade-flow.webm?url'

/** The pictures and video the demo's conversations show (`scenes/web-app.ts`): made up, shipped with the demo,
 *  found by name: a file by its path's last part, a tool's inline image by the file the tool read. */
const BY_NAME: Record<string, { url: string; type: string }> = {
  'billing-before.png': { url: billingBefore, type: 'image/png' },
  'billing-vat.png': { url: billingVat, type: 'image/png' },
  'upgrade-flow.webm': { url: upgradeFlow, type: 'video/webm' },
}

const NOT_SHOWN = () => new Response(JSON.stringify({ detail: 'the conversation shows no such image or video' }), { status: 404, headers: { 'content-type': 'application/json' } })
const lastPart = (path: string) => path.split('/').pop() ?? path

async function serve(name: string): Promise<Response> {
  const asset = BY_NAME[name]
  if (!asset) return NOT_SHOWN()
  const bytes = await (await fetch(asset.url)).arrayBuffer()
  return new Response(bytes, { headers: { 'content-type': asset.type, 'x-content-type-options': 'nosniff' } })
}

/** `GET /v1/sessions/{id}/media?path=` and `GET /v1/sessions/{id}/items/{seq}/media/{index}`, for what the
 *  session's conversation shows; else 404, as the daemon answers. */
export function mediaRoute(world: World, pathname: string, url: URL): Promise<Response> | null {
  const file = /^\/v1\/sessions\/([^/]+)\/media$/.exec(pathname)
  if (file) {
    const path = url.searchParams.get('path') ?? ''
    const shown = world.items(decodeURIComponent(file[1]!)).some((i) => (i.media ?? []).some((m) => m.source === 'file' && m.path === path))
    return shown ? serve(lastPart(path)) : Promise.resolve(NOT_SHOWN())
  }
  const inline = /^\/v1\/sessions\/([^/]+)\/items\/(\d+)\/media\/(\d+)$/.exec(pathname)
  if (inline) {
    const item = world.items(decodeURIComponent(inline[1]!)).find((i) => i.seq === Number(inline[2]))
    const ref = item?.media?.find((m) => m.source === 'inline' && m.index === Number(inline[3]))
    return ref && item?.text ? serve(lastPart(item.text)) : Promise.resolve(NOT_SHOWN())
  }
  return null
}
