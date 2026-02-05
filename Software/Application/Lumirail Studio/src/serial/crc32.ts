let crc32Table: Uint32Array | null = null

function buildTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
}

export function crc32(data: Uint8Array, init = 0xffffffff): number {
  if (!crc32Table) crc32Table = buildTable()
  let c = init >>> 0
  for (let i = 0; i < data.length; i++) {
    c = crc32Table[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}
