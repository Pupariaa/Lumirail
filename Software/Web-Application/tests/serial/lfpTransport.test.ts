import { describe, it, expect } from 'vitest'
import { buildFrame, parseFrame, encodeHello, MSG_HELLO } from '../../src/serial/lfpTransport'

describe('lfpTransport', () => {
  it('roundtrips a frame', () => {
    const payload = encodeHello(0x12345678)
    const buf = buildFrame(MSG_HELLO, 7, payload)
    const parsed = parseFrame(buf)
    expect(parsed).not.toBeNull()
    expect(parsed?.consumed).toBe(buf.length)
    expect(parsed?.frame.type).toBe(MSG_HELLO)
    expect(parsed?.frame.seq).toBe(7)
    expect(Array.from(parsed?.frame.payload ?? [])).toEqual(Array.from(payload))
  })

  it('skips leading bytes before SOF', () => {
    const payload = encodeHello(1)
    const frame = buildFrame(MSG_HELLO, 1, payload)
    const prefix = new Uint8Array([0x00, 0x01, 0x02, 0x03])
    const buf = new Uint8Array(prefix.length + frame.length)
    buf.set(prefix, 0)
    buf.set(frame, prefix.length)

    const parsed = parseFrame(buf)
    expect(parsed).not.toBeNull()
    expect(parsed?.consumed).toBe(prefix.length + frame.length)
    expect(parsed?.frame.type).toBe(MSG_HELLO)
  })

  it('returns null for incomplete frames', () => {
    const payload = encodeHello(2)
    const frame = buildFrame(MSG_HELLO, 2, payload)
    const truncated = frame.subarray(0, frame.length - 3)
    const parsed = parseFrame(truncated)
    expect(parsed).toBeNull()
  })
})

