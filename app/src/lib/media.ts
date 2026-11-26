/** What a file is, to show it: a picture (`<img>`), a video the browser plays (`<video>`: MP4 and WebM,
 *  what every browser the app runs in plays), or neither (a file to download). Said by its media type when
 *  there is one, else by its name's extension. */
export type MediaKind = 'image' | 'video'

const BY_TYPE: Record<string, MediaKind> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
}
const BY_EXTENSION: Record<string, MediaKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  mp4: 'video',
  webm: 'video',
}

export function mediaKind(name: string, type?: string | null): MediaKind | null {
  if (type) return BY_TYPE[type.toLowerCase().split(';')[0]!.trim()] ?? null
  const dot = name.lastIndexOf('.')
  return dot < 0 ? null : (BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null)
}
