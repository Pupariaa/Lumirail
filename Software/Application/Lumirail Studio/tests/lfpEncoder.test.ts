import { describe, it, expect } from 'vitest'
import { buildLfp } from '../src/lfpEncoder'
import { crc32 } from '../src/serial/crc32'

describe('buildLfp', () => {
  it('builds a valid LFP container with correct CRCs', () => {
    const tickMs = 100
    const channelCount = 2
    const frameData = new Uint8Array([
      0, 255,
      255, 0,
      128, 64,
    ])
    const out = buildLfp({ tickMs, channelCount, frameData })
    const outU8 = new Uint8Array(out)
    const dv = new DataView(out)

    expect(dv.getUint32(0, true)).toBe(0x3150464c)
    expect(dv.getUint16(4, true)).toBe(1)
    expect(dv.getUint16(6, true)).toBe(32)
    expect(dv.getUint16(12, true)).toBe(tickMs)
    expect(dv.getUint16(14, true)).toBe(channelCount)
    expect(dv.getUint32(16, true)).toBe(3)

    const dirOffset = dv.getUint32(20, true)
    const dirLen = dv.getUint32(24, true)
    expect(dirOffset + dirLen).toBe(outU8.length)

    const storedHeaderCrc = dv.getUint32(28, true)
    const headerCopy = outU8.slice(0, 32)
    headerCopy[28] = 0
    headerCopy[29] = 0
    headerCopy[30] = 0
    headerCopy[31] = 0
    expect(crc32(headerCopy)).toBe(storedHeaderCrc)

    const dirCopy = outU8.slice(dirOffset, dirOffset + dirLen)
    const dirView = new DataView(dirCopy.buffer, dirCopy.byteOffset, dirCopy.byteLength)
    expect(dirView.getUint32(0, true)).toBe(0x31524944)
    expect(dirView.getUint32(4, true)).toBe(1)

    const storedDirCrc = dirView.getUint32(8, true)
    dirCopy[8] = 0
    dirCopy[9] = 0
    dirCopy[10] = 0
    dirCopy[11] = 0
    expect(crc32(dirCopy)).toBe(storedDirCrc)

    const entryOffset = dirOffset + 12
    const chunkType = dv.getUint32(entryOffset + 0, true)
    const chunkVer = dv.getUint16(entryOffset + 4, true)
    const chunkFlags = dv.getUint16(entryOffset + 6, true)
    const framesOffset = dv.getUint32(entryOffset + 8, true)
    const framesLen = dv.getUint32(entryOffset + 12, true)
    const storedFramesCrc = dv.getUint32(entryOffset + 16, true)

    expect(chunkType).toBe(0x4d415246)
    expect(chunkVer).toBe(1)
    expect(chunkFlags).toBe(0)
    expect(framesOffset).toBe(32)
    expect(framesLen).toBe(frameData.length)

    const framesBytes = outU8.slice(framesOffset, framesOffset + framesLen)
    expect(crc32(framesBytes)).toBe(storedFramesCrc)
  })

  it('rejects invalid inputs', () => {
    expect(() => buildLfp({ tickMs: 0, channelCount: 1, frameData: new Uint8Array([]) })).toThrow()
    expect(() => buildLfp({ tickMs: 100, channelCount: 0, frameData: new Uint8Array([1]) })).toThrow()
    expect(() => buildLfp({ tickMs: 100, channelCount: 2, frameData: new Uint8Array([1]) })).toThrow()
  })
})

