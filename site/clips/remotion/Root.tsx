import { Composition } from 'remotion'
import type { ClipMeta } from '../clip.ts'
import { Clip, type ClipProps } from './Clip'
import { SIZE } from './theme'

const EMPTY: ClipMeta = { id: 'none', dpr: 2, fps: 30, length: 1, views: [], layers: [], events: [] }

/** One composition; each clip is it with that clip's recording (`meta`) as its props. */
export function Root() {
  return (
    <Composition
      id="Clip"
      component={Clip}
      defaultProps={{ meta: EMPTY } satisfies ClipProps}
      fps={30}
      {...SIZE}
      durationInFrames={1}
      calculateMetadata={({ props }) => ({ durationInFrames: props.meta.length, fps: props.meta.fps, ...SIZE })}
    />
  )
}
