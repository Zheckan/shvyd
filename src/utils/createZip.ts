import { deflateRawSync } from 'node:zlib'

export type ZipEntry = { path: string; data: Uint8Array }

// 1980-01-01 00:00, the earliest DOS timestamp. Fixed dates make archives reproducible.
const DOS_TIME = 0
const DOS_DATE = (0 << 9) | (1 << 5) | 1
const UTF8_FLAG = 0x0800
const DEFLATE = 8
const VERSION = 20

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index

  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }

  return value >>> 0
})

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff

  for (const byte of data) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

function header(size: number, fill: (view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(size)
  fill(new DataView(bytes.buffer))
  return bytes
}

/** Builds a deterministic ZIP archive: entries keep their order and a fixed timestamp. */
export function createZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.path)
    const compressed = new Uint8Array(deflateRawSync(entry.data, { level: 9 }))
    const crc = crc32(entry.data)

    const local = header(30, (view) => {
      view.setUint32(0, 0x04034b50, true)
      view.setUint16(4, VERSION, true)
      view.setUint16(6, UTF8_FLAG, true)
      view.setUint16(8, DEFLATE, true)
      view.setUint16(10, DOS_TIME, true)
      view.setUint16(12, DOS_DATE, true)
      view.setUint32(14, crc, true)
      view.setUint32(18, compressed.byteLength, true)
      view.setUint32(22, entry.data.byteLength, true)
      view.setUint16(26, name.byteLength, true)
      view.setUint16(28, 0, true)
    })

    const record = header(46, (view) => {
      view.setUint32(0, 0x02014b50, true)
      view.setUint16(4, VERSION, true)
      view.setUint16(6, VERSION, true)
      view.setUint16(8, UTF8_FLAG, true)
      view.setUint16(10, DEFLATE, true)
      view.setUint16(12, DOS_TIME, true)
      view.setUint16(14, DOS_DATE, true)
      view.setUint32(16, crc, true)
      view.setUint32(20, compressed.byteLength, true)
      view.setUint32(24, entry.data.byteLength, true)
      view.setUint16(28, name.byteLength, true)
      view.setUint32(42, offset, true)
    })

    parts.push(local, name, compressed)
    central.push(record, name)
    offset += local.byteLength + name.byteLength + compressed.byteLength
  }

  const centralSize = central.reduce(
    (total, part) => total + part.byteLength,
    0
  )
  const end = header(22, (view) => {
    view.setUint32(0, 0x06054b50, true)
    view.setUint16(8, entries.length, true)
    view.setUint16(10, entries.length, true)
    view.setUint32(12, centralSize, true)
    view.setUint32(16, offset, true)
  })

  const all = [...parts, ...central, end]
  const result = new Uint8Array(
    all.reduce((total, part) => total + part.byteLength, 0)
  )
  let position = 0

  for (const part of all) {
    result.set(part, position)
    position += part.byteLength
  }

  return result
}
