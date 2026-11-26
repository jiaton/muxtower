import { ImageOff } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { ImageViewer } from '@/components/ui/image-viewer'
import { VideoPlayer, VideoThumb } from '@/components/ui/video'
import { mediaKind } from '@/lib/media'
import { useObjectUrl } from '@/lib/use-object-url'
import { useSessionImage } from '../api/use-session-image'
import { Spinner } from '@/components/ui/indicators'
import { Button } from '@/components/ui/button'
import { ink, look } from '@/components/ui/intents'

const baseName = (path: string) => path.split('/').pop() ?? path
const isVideo = (path: string) => mediaKind(path) === 'video'

/** One picture's or video's file, as a URL for <img> or <video> (cached: a thumbnail and its large view
 *  load it once). */
function useImageUrl(daemonId: string, sessionId: string, path: string) {
  const image = useSessionImage(daemonId, sessionId, path)
  return { url: useObjectUrl(image.data), failed: image.isError }
}

/** Every picture and video a conversation shows, in order, opened large one at a time (`ImageViewer`). */
const Gallery = createContext<((path: string) => void) | null>(null)

/** Around a conversation: its pictures and videos (`paths`, all of them, in the order it shows them; a video
 *  by its extension, `mediaKind`) as one gallery, so any of them opens large and the others are a swipe or
 *  an arrow key away. */
export function ConversationGallery({
  daemonId,
  sessionId,
  paths,
  children,
}: {
  daemonId: string
  sessionId: string
  paths: string[]
  children: ReactNode
}) {
  const [index, setIndex] = useState<number | null>(null)
  const open = useCallback((path: string) => setIndex(Math.max(0, paths.indexOf(path))), [paths])
  return (
    <Gallery.Provider value={open}>
      {children}
      <ImageViewer
        count={paths.length}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
        title={(i) => baseName(paths[i] ?? '')}
        description={(i) => paths[i]}
        slide={(i) => <Large key={paths[i]} daemonId={daemonId} sessionId={sessionId} path={paths[i] ?? ''} />}
      />
    </Gallery.Provider>
  )
}

function Large({ daemonId, sessionId, path }: { daemonId: string; sessionId: string; path: string }) {
  const { url, failed } = useImageUrl(daemonId, sessionId, path)
  if (!url) return failed ? <ImageOff className="size-6" aria-label={`${baseName(path)} not available`} /> : <Spinner />
  if (isVideo(path)) return <VideoPlayer src={url} label={baseName(path)} />
  return <img src={url} alt={baseName(path)} draggable={false} />
}

function SessionImage({ daemonId, sessionId, path, onOpen }: { daemonId: string; sessionId: string; path: string; onOpen: () => void }) {
  const { url, failed } = useImageUrl(daemonId, sessionId, path)
  if (!url)
    return (
      <span className={`${look.panel} ${ink.meta} flex h-24 w-32 flex-col items-center justify-center gap-1 px-2 text-center`}>
        {failed ? <ImageOff className="size-4" aria-hidden /> : <Spinner />}
        <span className="w-full truncate">{failed ? `${baseName(path)} not available` : baseName(path)}</span>
      </span>
    )
  return (
    <Button
      variant="plain"
      title={path}
      aria-label={isVideo(path) ? `Play ${baseName(path)}` : undefined}
      className={`${look.panel} overflow-hidden`}
      onClick={onOpen}
    >
      {isVideo(path) ? (
        <VideoThumb src={url} className="aspect-video h-36" />
      ) : (
        <img src={url} alt={baseName(path)} className="block max-h-48 max-w-full object-contain" />
      )}
    </Button>
  )
}

/** The images an item shows (`ConversationItem.images`), small; one opens large when tapped, in its
 *  conversation's gallery (`ConversationGallery`), or on its own outside one. */
export function ConversationImages({ daemonId, sessionId, paths }: { daemonId: string; sessionId: string; paths: string[] }) {
  const gallery = useContext(Gallery)
  if (!paths.length) return null
  const thumbs = (open: (path: string) => void) => (
    <div className="flex flex-wrap gap-2">
      {paths.map((path) => (
        <SessionImage key={path} daemonId={daemonId} sessionId={sessionId} path={path} onOpen={() => open(path)} />
      ))}
    </div>
  )
  if (gallery) return thumbs(gallery)
  return (
    <ConversationGallery daemonId={daemonId} sessionId={sessionId} paths={paths}>
      <Gallery.Consumer>{(open) => thumbs(open!)}</Gallery.Consumer>
    </ConversationGallery>
  )
}
