const CRC16_POLY = 0x1021
const CRC16_INIT = 0xffff

let crc16Table: Uint16Array | null = null

function buildTable(): Uint16Array {
  const table = new Uint16Array(256)
  for (let i = 0; i < 256; i++) {
    let c = (i << 8) & 0xffff
    for (let k = 0; k < 8; k++) {
      c = (c & 0x8000) ? ((c << 1) ^ CRC16_POLY) & 0xffff : (c << 1) & 0xffff
    }
    table[i] = c
  }
  return table
}

export function crc16CcittFalse(data: Uint8Array): number {
  if (!crc16Table) crc16Table = buildTable()
  let crc = CRC16_INIT
  for (let i = 0; i < data.length; i++) {
    crc = (crc16Table[(crc >>> 8) ^ data[i]] ^ (crc << 8)) & 0xffff
  }
  return crc
}
