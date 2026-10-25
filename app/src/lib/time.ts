/** "now", "4m", "2h", "3d", "5w": how long ago `iso` was, short enough for a list row. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000)
  if (!(minutes >= 1)) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h`
  if (minutes < 14 * 1440) return `${Math.floor(minutes / 1440)}d`
  return `${Math.floor(minutes / 10080)}w`
}
