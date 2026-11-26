import { ApiError } from '@/lib/api/client'

/** Why a picture or video cannot show, as its thumbnail and large view say it:
 *  - `hidden`: nothing at all: the daemon does not show it (404, before it ever showed) or it is not an image
 *    or a video by its content (415);
 *  - `gone`: "File no longer there": deleted since (410), or a 404 after it once showed;
 *  - `tooLarge`: "Too large to show" (413, over 25 MB);
 *  - `unreachable`: its machine cannot be reached now (409): offered again;
 *  - `failed`: anything else ("not available"). */
export type MediaProblem = 'hidden' | 'gone' | 'tooLarge' | 'unreachable' | 'failed'

export function mediaProblem(error: unknown, shownBefore: boolean): MediaProblem {
  const status = error instanceof ApiError ? error.status : 0
  if (status === 404) return shownBefore ? 'gone' : 'hidden'
  if (status === 410) return 'gone'
  if (status === 413) return 'tooLarge'
  if (status === 415) return 'hidden'
  if (status === 409) return 'unreachable'
  return 'failed'
}

/** What a problem says, quietly; none for `hidden`. */
export const PROBLEM_TEXT: Record<Exclude<MediaProblem, 'hidden' | 'failed'>, string> = {
  gone: 'File no longer there',
  tooLarge: 'Too large to show',
  unreachable: "Its machine can't be reached",
}
