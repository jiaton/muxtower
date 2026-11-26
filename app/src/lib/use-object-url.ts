import { useEffect, useMemo } from 'react'

/** A blob (a fetched file, or a File the owner picked) as a URL for <img> or <video>, revoked when the blob
 *  changes or the component goes. */
export function useObjectUrl(blob: Blob | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob])
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url])
  return url
}
