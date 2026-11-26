import { ImageOff } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ImageViewer } from '@/components/ui/image-viewer'
import { VideoPlayer, VideoThumb } from '@/components/ui/video'
import { useObjectUrl } from '@/lib/use-object-url'
import { useSessionImage } from '../api/use-session-image'
import { isGone, useGoneShared, useSharedFile } from '../api/use-shared-file'
import { isExpired, pathMedia, withoutGone, type GalleryMedia } from '../model/gallery'
import { Spinner } from '@/components/ui/indicators'
import { Button } from '@/components/ui/button'
import { ink, look } from '@/components/ui/intents'

/** One picture's or video's file, as a URL for <img> or <video> (cached: a thumbnail and its large view
 *  load it once): by its path, or as a file an agent shared. `gone`: a shared file the daemon no longer
 *  keeps (expired, or a 404). */
function useMediaUrl(daemonId: string, sessionId: string, media: GalleryMedia) {
  const expired = media.from === 'shared' && isExpired(media.file)
  const image = useSessionImage(daemonId, sessionId, media.from === 'path' ? media.path : '', media.from === 'path')
  const shared = useSharedFile(daemonId, sessionId, media.from === 'shared' && !expired ? media.file : undefined)
  const query = media.from === 'path' ? image : shared
  return { url: useObjectUrl(query.data), failed: query.isError, gone: expired || (media.from === 'shared' && isGone(shared.error)) }
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
  // A shared file the daemon answered 404 for (its thumbnail asked) no longer counts.
  const gone = useGoneShared(daemonId, sessionId)
  const media = useMemo(() => withoutGone(all, gone), [all, gone])
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
  const { url, failed, gone } = useMediaUrl(daemonId, sessionId, media)
  if (gone) return <p className={ink.meta}>Expired</p>
  if (!url) return failed ? <ImageOff className="size-6" aria-label={`${media.name} not available`} /> : <Spinner />
  if (media.kind === 'video') return <VideoPlayer src={url} label={media.name} />
  return <img src={url} alt={media.name} draggable={false} />
}

/** A picture or video small, opening large in its conversation's gallery when tapped. Loading or failed,
 *  a placeholder that says so; a shared file that is gone, `gone` instead (its item says "Expired"). */
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
  const { url, failed, gone } = useMediaUrl(daemonId, sessionId, media)
  if (gone) return whenGone
  if (!url)
    return (
      <span className={`${look.panel} ${ink.meta} flex h-24 w-32 flex-col items-center justify-center gap-1 px-2 text-center`}>
        {failed ? <ImageOff className="size-4" aria-hidden /> : <Spinner />}
        <span className="w-full truncate">{failed ? `${media.name} not available` : media.name}</span>
      </span>
    )
  const video = media.kind === 'video'
  return (
    <Button
      variant="plain"
      title={media.description}
      aria-label={video ? `Play ${media.name}` : undefined}
      className={`${look.panel} overflow-hidden`}
      onClick={() => open?.(media.key)}
    >
      {video ? (
        <VideoThumb src={url} className="aspect-video h-36" />
      ) : (
        <img src={url} alt={media.name} className="block max-h-48 max-w-full object-contain" />
      )}
    </Button>
  )
}

/** The pictures and videos an item shows by path (`ConversationItem.images`), small; one opens large when
 *  tapped, in its conversation's gallery (`ConversationGallery`), or on its own outside one. */
export function ConversationImages({ daemonId, sessionId, paths }: { daemonId: string; sessionId: string; paths: string[] }) {
  const gallery = useContext(Gallery)
  const media = useMemo(() => paths.map(pathMedia), [paths])
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
