import { useEffect, useState } from 'react'

/** A blob (a fetched file, or a File the owner picked) as a URL for <img> or <video>, revoked when the blob
 *  changes or the component goes. Made and revoked in one effect, so an effect run again (StrictMode, a
 *  remount) makes a new URL rather than leaving a revoked one in use; only a URL made for this blob is
 *  given, so nothing shows the previous file's URL for a render. */
export function useObjectUrl(blob: Blob | undefined) {
  const [made, setMade] = useState<{ blob: Blob; url: string } | null>(null)
  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    setMade({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return blob && made?.blob === blob ? made.url : undefined
}
