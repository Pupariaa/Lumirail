const LFP_HEADER_LEN = 32
const LFP_MAGIC = 0x3150464c
const DIR_MAGIC = 0x31524944
const CHUNK_FRAMES = 0x4d415246

let crc32Table: Uint32Array | null = null

function buildCrc32Table(): Uint32Array {
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

function crc32Update(crc: number, data: Uint8Array): number {
  if (!crc32Table) crc32Table = buildCrc32Table()
  let c = crc >>> 0
  for (let i = 0; i < data.length; i++) {
    c = crc32Table[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  }
  return (c >>> 0) >>> 0
}

function crc32(data: Uint8Array, init = 0xffffffff): number {
  return (crc32Update(init, data) ^ 0xffffffff) >>> 0
}

export interface LfpBuildOptions {
  tickMs: number
  channelCount: number
  frameData: Uint8Array
}

export function buildLfp(options: LfpBuildOptions): ArrayBuffer {
  const { tickMs, channelCount, frameData } = options
  const frameCount = frameData.length / channelCount
  const framesPayloadLen = frameData.length
  const framesOffset = LFP_HEADER_LEN
  const dirEntryLen = 20
  const dirHeaderLen = 4 + 4 + 4
  const dirLen = dirHeaderLen + dirEntryLen
  const dirOffset = framesOffset + framesPayloadLen

  const header = new ArrayBuffer(LFP_HEADER_LEN)
  const headerView = new DataView(header)
  headerView.setUint32(0, LFP_MAGIC, true)
  headerView.setUint16(4, 1, true)
  headerView.setUint16(6, LFP_HEADER_LEN, true)
  headerView.setUint32(8, 0, true)
  headerView.setUint16(12, tickMs, true)
  headerView.setUint16(14, channelCount, true)
  headerView.setUint32(16, frameCount, true)
  headerView.setUint32(20, dirOffset, true)
  headerView.setUint32(24, dirLen, true)
  headerView.setUint32(28, 0, true)

  const headerCrc = crc32(new Uint8Array(header))
  headerView.setUint32(28, headerCrc, true)

  const dirBuf = new ArrayBuffer(dirLen)
  const dirView = new DataView(dirBuf)
  dirView.setUint32(0, DIR_MAGIC, true)
  dirView.setUint32(4, 1, true)
  dirView.setUint32(8, 0, true)
  dirView.setUint32(12, CHUNK_FRAMES, true)
  dirView.setUint16(16, 1, true)
  dirView.setUint16(18, 0, true)
  dirView.setUint32(20, framesOffset, true)
  dirView.setUint32(24, framesPayloadLen, true)
  const framesCrc = crc32(frameData)
  dirView.setUint32(28, framesCrc, true)

  const dirCrc = crc32(new Uint8Array(dirBuf))
  dirView.setUint32(8, dirCrc, true)

  const totalLen = dirOffset + dirLen
  const out = new ArrayBuffer(totalLen)
  const outU8 = new Uint8Array(out)
  outU8.set(new Uint8Array(header), 0)
  outU8.set(frameData, framesOffset)
  outU8.set(new Uint8Array(dirBuf), dirOffset)
  return out
}
