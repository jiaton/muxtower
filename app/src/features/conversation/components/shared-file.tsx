import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FileCard } from '@/components/ui/file-card'
import { Spinner } from '@/components/ui/indicators'
import { ink } from '@/components/ui/intents'
import type { ConversationItem, SharedFile } from '@/lib/api/types'
import { formatSize, splitName } from '@/lib/file-name'
import { isGone, useDownloadShared, useGoneShared } from '../api/use-shared-file'
import { isExpired, sharedMedia, sharedWhen } from '../model/gallery'
import { MediaThumb } from './conversation-images'
import type { ConversationSource } from './conversation-view'

/**
 * A file the agent shared (`kind: 'shared'`), said like a reply: its caption, then the file, then when.
 * A picture or a video is a thumbnail in the conversation's gallery (opens large); anything else (a PDF,
 * a log) a card with its name, its size and Download, which saves it and never opens it here. Once the
 * daemon no longer keeps it (`expires_at` passed, or it answers 404), a card that says "Expired", with
 * no thumbnail to break.
 */
export function SharedFileItem({ item, source }: { item: ConversationItem; source?: ConversationSource }) {
  const file = item.shared!
  const caption = item.text || file.caption
  const media = sharedMedia(file)
  const gone = <SharedFileCard file={file} source={source} expired />
  const expired = isExpired(file)
  return (
    <div className="flex flex-col items-start gap-2" data-shared={file.id}>
      {caption ? <p className="whitespace-pre-wrap">{caption}</p> : null}
      {expired || !source ? (
        <SharedFileCard file={file} source={source} expired={expired} />
      ) : media ? (
        <MediaThumb daemonId={source.daemonId} sessionId={source.sessionId} media={media} gone={gone} />
      ) : (
        <SharedFileCard file={file} source={source} />
      )}
      {media && !expired && source ? (
        <SharedLine file={file} source={source} />
      ) : (
        <p className={ink.meta}>
          Shared <time dateTime={file.shared_at}>{sharedWhen(file.shared_at)}</time>
        </p>
      )}
    </div>
  )
}

/** A shared picture's or video's line: when, its name and size; only when once the daemon answered 404 for
 *  it before its time (its thumbnail asked), as its card then says "Expired". */
function SharedLine({ file, source }: { file: SharedFile; source: ConversationSource }) {
  const pruned = useGoneShared(source.daemonId, source.sessionId).has(file.id)
  return (
    <p className={ink.meta}>
      Shared <time dateTime={file.shared_at}>{sharedWhen(file.shared_at)}</time>
      {pruned ? null : ` · ${file.name} · ${formatSize(file.size)}`}
    </p>
  )
}

function SharedFileCard({ file, source, expired = false }: { file: SharedFile; source?: ConversationSource; expired?: boolean }) {
  const download = useDownloadShared(source?.daemonId ?? '', source?.sessionId ?? '')
  const gone = expired || isGone(download.error)
  const failed = download.isError && !gone
  return (
    <FileCard
      name={file.name}
      {...splitName(file.name)}
      detail={gone ? 'Expired' : failed ? 'Download failed' : formatSize(file.size)}
      tone={failed ? 'danger' : 'muted'}
      gone={gone}
      action={
        source ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={download.isPending}
            aria-label={`${failed ? 'Retry downloading' : 'Download'} ${file.name}`}
            onClick={() => download.mutate(file)}
          >
            {download.isPending ? <Spinner /> : <Download aria-hidden />}
            {failed ? 'Retry' : 'Download'}
          </Button>
        ) : undefined
      }
    />
  )
}
