import { ImageOff, RotateCw } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ImageViewer } from '@/components/ui/image-viewer'
import { VideoPlayer, VideoTile } from '@/components/ui/video'
import { useObjectUrl } from '@/lib/use-object-url'
import { useSessionImage } from '../api/use-session-image'
import { useSessionMedia, useUnshownMedia, type MediaTarget } from '../api/use-session-media'
import { isGone, useSharedFile } from '../api/use-shared-file'
import { isExpired, withoutKeys, type GalleryMedia } from '../model/gallery'
import { mediaProblem, PROBLEM_TEXT, type MediaProblem } from '../model/media-state'
import { Spinner } from '@/components/ui/indicators'
import { Button } from '@/components/ui/button'
import { ink, look } from '@/components/ui/intents'

const targetOf = (media: GalleryMedia): MediaTarget | undefined =>
  media.from === 'file' ? { from: 'file', path: media.path } : media.from === 'inline' ? { from: 'inline', seq: media.seq, index: media.index } : undefined

/** The gallery keys that once showed on this page: a 404 for one of them later means it is gone, not that it
 *  never was (`mediaProblem`). */
const shownOnce = new Set<string>()

/**
 * One picture's or video's file, as a URL for <img> or <video> (cached: a thumbnail and its large view load it
 * once): a file an item names or an image in a tool's result (`useSessionMedia`), an old daemon's image by
 * path, or a file an agent shared. `gone`: a shared file the daemon no longer keeps (expired, or a 404);
 * `problem`: why a file or inline image cannot show; `retry` asks again (its machine was away). Without
 * `fetch` (a video's tile) nothing is asked for: only what an earlier open found is read.
 */
function useMediaUrl(daemonId: string, sessionId: string, media: GalleryMedia, fetch = true) {
  const expired = media.from === 'shared' && isExpired(media.file)
  const image = useSessionImage(daemonId, sessionId, media.from === 'path' ? media.path : '', fetch && media.from === 'path')
  const shared = useSharedFile(daemonId, sessionId, media.from === 'shared' && !expired ? media.file : undefined, fetch)
  const ref = useSessionMedia(daemonId, sessionId, targetOf(media), fetch)
  const query = media.from === 'path' ? image : media.from === 'shared' ? shared : ref
  const url = useObjectUrl(query.data)
  if (query.data) shownOnce.add(media.key)
  const problem: MediaProblem | null = targetOf(media) && ref.isError ? mediaProblem(ref.error, shownOnce.has(media.key)) : null
  return {
    url,
    failed: query.isError,
    gone: expired || (media.from === 'shared' && isGone(shared.error)),
    problem,
    retry: () => void ref.refetch(),
  }
}

/** A quiet word in place of a picture or video that cannot show (gone, too large), or that its machine is
 *  away, with Retry. */
function Problem({ problem, onRetry, large = false }: { problem: Exclude<MediaProblem, 'hidden' | 'failed'>; onRetry: () => void; large?: boolean }) {
  return (
    <span className={`${large ? '' : look.panel} ${ink.meta} flex flex-col items-center justify-center gap-1 px-3 py-2 text-center`}>
      <span className="flex items-center gap-1.5">
        <ImageOff className="size-4 shrink-0" aria-hidden />
        {PROBLEM_TEXT[problem]}
      </span>
      {problem === 'unreachable' ? (
        <Button size="xs" variant="ghost" onClick={onRetry}>
          <RotateCw aria-hidden /> Retry
        </Button>
      ) : null}
    </span>
  )
}

/** Every picture and video a conversation shows, in order, opened large one at a time (`ImageViewer`). */
const Gallery = createContext<((key: string) => void) | null>(null)

/** Around a conversation: its pictures and videos (`media`, all of them, in the order it shows them:
 *  `conversationMedia`) as one gallery, so any of them opens large and the others are a swipe or an arrow
 *  key away. */
export function ConversationGallery({
  daemonId,
  sessionId,
  media: all,
  children,
}: {
  daemonId: string
  sessionId: string
  media: GalleryMedia[]
  children: ReactNode
}) {
  // What cannot show (its thumbnail asked: gone, too large, not media, its machine away) does not count.
  const unshown = useUnshownMedia(daemonId, sessionId)
  const media = useMemo(() => withoutKeys(all, unshown), [all, unshown])
  const [index, setIndex] = useState<number | null>(null)
  const open = useCallback(
    (key: string) =>
      setIndex(
        Math.max(
          0,
          media.findIndex((m) => m.key === key),
        ),
      ),
    [media],
  )
  return (
    <Gallery.Provider value={open}>
      {children}
      <ImageViewer
        count={media.length}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
        title={(i) => media[i]?.name ?? ''}
        description={(i) => media[i]?.description}
        slide={(i) => (media[i] ? <Large key={media[i].key} daemonId={daemonId} sessionId={sessionId} media={media[i]} /> : null)}
      />
    </Gallery.Provider>
  )
}

function Large({ daemonId, sessionId, media }: { daemonId: string; sessionId: string; media: GalleryMedia }) {
  const { url, failed, gone, problem, retry } = useMediaUrl(daemonId, sessionId, media)
  if (gone) return <p className={ink.meta}>Expired</p>
  if (problem && problem !== 'failed') return problem === 'hidden' ? null : <Problem problem={problem} onRetry={retry} large />
  if (!url) return failed ? <ImageOff className="size-6" aria-label={`${media.name} not available`} /> : <Spinner />
  if (media.kind === 'video') return <VideoPlayer src={url} label={media.name} />
  return <img src={url} alt={media.name} draggable={false} />
}

/** A picture or video small, opening large in its conversation's gallery when tapped. A picture loads with
 *  it (loading or failed, a placeholder that says so); a video is a tile (`VideoTile`) that loads nothing
 *  until opened, as it may be large. A shared file that is gone, `gone` instead (its item says "Expired"). */
export function MediaThumb({
  daemonId,
  sessionId,
  media,
  gone: whenGone = null,
}: {
  daemonId: string
  sessionId: string
  media: GalleryMedia
  gone?: ReactNode
}) {
  const open = useContext(Gallery)
  const video = media.kind === 'video'
  const { url, failed, gone, problem, retry } = useMediaUrl(daemonId, sessionId, media, !video)
  if (gone) return whenGone
  if (problem && problem !== 'failed') return problem === 'hidden' ? null : <Problem problem={problem} onRetry={retry} />
  if (video)
    return (
      <Button variant="plain" title={media.description} aria-label={`Play ${media.name}`} className={`${look.panel} overflow-hidden`} onClick={() => open?.(media.key)}>
        <VideoTile name={media.name} className="aspect-video h-36" />
      </Button>
    )
  if (!url)
    return (
      <span className={`${look.panel} ${ink.meta} flex h-24 w-32 flex-col items-center justify-center gap-1 px-2 text-center`}>
        {failed ? <ImageOff className="size-4" aria-hidden /> : <Spinner />}
        <span className="w-full truncate">{failed ? `${media.name} not available` : media.name}</span>
      </span>
    )
  return (
    <Button variant="plain" title={media.description} className={`${look.panel} overflow-hidden`} onClick={() => open?.(media.key)}>
      <img src={url} alt={media.name} className="block max-h-48 max-w-full object-contain" />
    </Button>
  )
}

/** The pictures and videos items show (`itemMedia`: their `media`, or an old daemon's `images`), small; one
 *  opens large when tapped, in its conversation's gallery (`ConversationGallery`), or on its own outside one. */
export function ConversationImages({ daemonId, sessionId, media }: { daemonId: string; sessionId: string; media: GalleryMedia[] }) {
  const gallery = useContext(Gallery)
  if (!media.length) return null
  const thumbs = (
    <div className="flex flex-wrap gap-2">
      {media.map((m) => (
        <MediaThumb key={m.key} daemonId={daemonId} sessionId={sessionId} media={m} />
      ))}
    </div>
  )
  if (gallery) return thumbs
  return (
    <ConversationGallery daemonId={daemonId} sessionId={sessionId} media={media}>
      {thumbs}
    </ConversationGallery>
  )
}
