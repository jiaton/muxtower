/** One finished clip, 16:9: each recorded screen in a phone or a browser window where the clip's layout
 *  puts it, a drawn terminal if it has one, and over it all the step's caption, words said, keys pressed. */
import '@fontsource-variable/geist'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { ClipMeta } from '../clip.ts'
import { Caption, Keys, Said } from './Overlays'
import { Screen, screenBox } from './Screen'
import { Terminal } from './Terminal'
import { C } from './theme'

export interface ClipProps {
  meta: ClipMeta
  [key: string]: unknown
}

export function Clip({ meta }: ClipProps) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const t = frame / fps
  const end = durationInFrames / fps
  const opacity = interpolate(t, [0, 0.3, end - 0.45, end], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const first = meta.views[0]?.name
  const boxes = Object.fromEntries(
    meta.layers.flatMap((l) => {
      if (!('view' in l)) return []
      const view = meta.views.find((v) => v.name === l.view)
      return view ? [[view.name, screenBox(view, l)]] : []
    }),
  )
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: 'Geist Variable, sans-serif', opacity }}>
      {meta.layers.map((layer, i) => {
        if ('terminal' in layer) return <Terminal key={i} layer={layer} events={meta.events} t={t} />
        const view = meta.views.find((v) => v.name === layer.view)!
        const events = meta.events.filter((e) => ('view' in e && e.view ? e.view : first) === view.name)
        return <Screen key={i} id={meta.id} view={view} box={boxes[view.name]!} url={layer.url} events={events} frame={frame} t={t} />
      })}
      <Caption events={meta.events} t={t} />
      <Said events={meta.events} t={t} boxes={boxes} first={first} />
      <Keys events={meta.events} t={t} />
    </AbsoluteFill>
  )
}
