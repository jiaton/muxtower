import { ImageOff, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { useSessionImage } from '../api/use-session-image'
import { surface, textRole } from '@/components/ui/styles'

const baseName = (path: string) => path.split('/').pop() ?? path

/** A blob as a URL for <img>, given back when the image goes. */
function useObjectUrl(blob: Blob | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob])
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url])
  return url
}

function SessionImage({ daemonId, sessionId, path }: { daemonId: string; sessionId: string; path: string }) {
  const image = useSessionImage(daemonId, sessionId, path)
  const url = useObjectUrl(image.data)
  const [open, setOpen] = useState(false)
  if (!url)
    return (
      <span
        className={`${textRole.meta} flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-md border border-border bg-surface-muted px-2 text-center`}
      >
        {image.isError ? <ImageOff className="size-4" aria-hidden /> : <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        <span className="w-full truncate">{image.isError ? `${baseName(path)} not available` : baseName(path)}</span>
      </span>
    )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" title={path} className={`${surface.muted} overflow-hidden`}>
          <img src={url} alt={baseName(path)} className="block max-h-48 max-w-full object-contain" />
        </button>
      </DialogTrigger>
      <DialogContent title={baseName(path)} description={path} className="sm:max-w-4xl">
        <img src={url} alt={baseName(path)} className="mx-auto max-h-[75dvh] max-w-full object-contain" />
      </DialogContent>
    </Dialog>
  )
}

/** The images an item shows (`ConversationItem.images`), small; one opens whole when tapped. */
export function ConversationImages({ daemonId, sessionId, paths }: { daemonId: string; sessionId: string; paths: string[] }) {
  if (!paths.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {paths.map((path) => (
        <SessionImage key={path} daemonId={daemonId} sessionId={sessionId} path={path} />
      ))}
    </div>
  )
}
