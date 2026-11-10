import { Composition } from 'remotion'
import type { ClipMeta } from '../clip.ts'
import { Clip, type ClipProps, SIZE } from './Clip'

const EMPTY: ClipMeta = { id: 'none', frame: 'phone', viewport: { width: 390, height: 844 }, dpr: 2, fps: 30, frames: ['f0000.jpg'], events: [] }

/** One composition; each clip is it with that clip's recording (`meta`) as its props. */
export function Root() {
  return (
    <Composition
      id="Clip"
      component={Clip}
      defaultProps={{ meta: EMPTY } satisfies ClipProps}
      fps={30}
      width={SIZE.phone.width}
      height={SIZE.phone.height}
      durationInFrames={1}
      calculateMetadata={({ props }) => ({
        durationInFrames: props.meta.frames.length,
        fps: props.meta.fps,
        ...SIZE[props.meta.frame],
      })}
    />
  )
}
