/** Makes the site's feature clips, all of them or those named: `npm run clips [-- live-list ...]`.
 *  1. builds the demo app (../../app, with the clip hook it has under `?clip`) and serves it here;
 *  2. records each clip's script in it (record.ts, scripts/);
 *  3. finishes each one with Remotion (remotion/) into an MP4 (H.264), a WebM (VP9) and a poster, muted;
 *  4. puts them in ../public/clips/, where the page loads them.
 *  CLIPS_REUSE=1 finishes the last recordings again without recording; CLIPS_STILLS=2,7.5 renders only
 *  those moments (seconds), as stills under public/raw/<id>/, for a look while working on one. */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundle } from '@remotion/bundler'
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer'
import { chromium } from 'playwright'
import { record, type ClipScript } from './record.ts'
import { liveList } from './scripts/live-list.ts'
import { teamHandoff } from './scripts/team-handoff.ts'
import { liveVoice } from './scripts/live-voice.ts'
import { keyboardFlow } from './scripts/keyboard-flow.ts'
import type { ClipMeta } from './clip.ts'

const SCRIPTS: ClipScript[] = [liveList, teamHandoff, liveVoice, keyboardFlow]

const here = fileURLToPath(new URL('.', import.meta.url))
const app = join(here, '../../app')
const raw = join(here, 'public/raw')
const out = join(here, '../public/clips')
const wanted = process.argv.slice(2)
const scripts = wanted.length ? SCRIPTS.filter((s) => wanted.includes(s.id)) : SCRIPTS

const reuse = Boolean(process.env.CLIPS_REUSE)
if (!process.env.CLIPS_SKIP_BUILD && !reuse)
  execSync('npm run build:demo', { cwd: app, stdio: 'inherit', env: { ...process.env, MUXTOWER_BASE: '/' } })

// The demo build, served as its own origin (it routes by hash; one index.html serves it all).
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
}
const root = join(app, 'dist-demo')
const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname
  let file = join(root, path === '/' ? 'index.html' : path)
  try {
    if (!statSync(file).isFile()) file = join(root, 'index.html')
  } catch {
    file = join(root, 'index.html')
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
const port = (server.address() as { port: number }).port
const demo = `http://127.0.0.1:${port}/`

const metas: ClipMeta[] = []
for (const script of scripts) {
  if (reuse) {
    metas.push(JSON.parse(readFileSync(join(raw, script.id, 'meta.json'), 'utf8')) as ClipMeta)
    continue
  }
  console.log(`recording ${script.id}`)
  metas.push(await record(script, demo, raw))
}
server.close()

console.log('bundling the finishing pass')
const serveUrl = await bundle({ entryPoint: join(here, 'remotion/index.ts'), publicDir: join(here, 'public') })
const browserExecutable = chromium.executablePath()
// Drawn at 1920×1080, put out at 1440×810: more than the site's widest slot, half the bytes.
const scale = 0.75
mkdirSync(out, { recursive: true })
for (const meta of metas) {
  const inputProps = { meta }
  const composition = await selectComposition({ serveUrl, id: 'Clip', inputProps, browserExecutable })
  const base = join(out, meta.id)
  if (process.env.CLIPS_STILLS) {
    for (const at of process.env.CLIPS_STILLS.split(',').map(Number)) {
      const frame = Math.min(composition.durationInFrames - 1, Math.round(at * composition.fps))
      await renderStill({
        serveUrl,
        composition,
        inputProps,
        browserExecutable,
        frame,
        imageFormat: 'jpeg',
        jpegQuality: 80,
        scale: 0.5,
        output: join(raw, meta.id, `still-${at}.jpg`),
      })
    }
    console.log(`stills of ${meta.id} in ${join(raw, meta.id)} (${(composition.durationInFrames / composition.fps).toFixed(1)} s)`)
    continue
  }
  console.log(
    `rendering ${meta.id}: ${composition.width * scale}x${composition.height * scale}, ${(composition.durationInFrames / composition.fps).toFixed(1)} s`,
  )
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    browserExecutable,
    codec: 'h264',
    scale,
    crf: 26,
    x264Preset: 'veryslow',
    muted: true,
    outputLocation: `${base}.mp4`,
  })
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    browserExecutable,
    codec: 'vp9',
    scale,
    crf: 38,
    muted: true,
    outputLocation: `${base}.webm`,
  })
  // The poster: the clip's last moment, everything that happened in view.
  await renderStill({
    serveUrl,
    composition,
    inputProps,
    browserExecutable,
    frame: composition.durationInFrames - 20,
    scale,
    imageFormat: 'jpeg',
    jpegQuality: 82,
    output: `${base}.jpg`,
  })
  for (const ext of ['mp4', 'webm', 'jpg']) console.log(`  ${meta.id}.${ext}: ${(statSync(`${base}.${ext}`).size / 1024).toFixed(0)} KB`)
}
