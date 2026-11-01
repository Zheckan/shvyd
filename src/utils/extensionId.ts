/**
 * The ID Chromium gives an extension whose manifest has this public `key`:
 * the first 32 hex digits of its SHA-256, written with the letters a to p.
 */
export function extensionId(publicKey: string): string {
  const der = Uint8Array.from(atob(publicKey), (char) => char.charCodeAt(0))
  const hex = new Bun.CryptoHasher('sha256').update(der).digest('hex')

  return Array.from(hex.slice(0, 32), (digit) =>
    String.fromCharCode(97 + parseInt(digit, 16))
  ).join('')
}
