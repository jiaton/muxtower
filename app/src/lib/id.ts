/** Random id that also works outside a secure context: crypto.randomUUID() only exists on HTTPS or
 *  localhost, getRandomValues() exists everywhere (the bundled UI may be opened over plain-HTTP LAN). */
export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
