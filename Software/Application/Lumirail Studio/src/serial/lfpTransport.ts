import { crc16CcittFalse } from './crc16'
import { crc32 } from './crc32'

export const LFP_SOF = [0x55, 0xaa] as const
export const LFP_VER = 0x01

export const MSG_HELLO = 0x01
export const MSG_HELLO_ACK = 0x02
export const MSG_BEGIN = 0x03
export const MSG_BEGIN_ACK = 0x04
export const MSG_DATA = 0x05
export const MSG_ACK = 0x06
export const MSG_NACK = 0x07
export const MSG_END = 0x08
export const MSG_END_ACK = 0x09

const FRAME_HEADER_LEN = 2 + 1 + 1 + 1 + 2

export interface LfpFrame {
  type: number
  seq: number
  payload: Uint8Array
}

export function buildFrame(type: number, seq: number, payload: Uint8Array): Uint8Array {
  const len = payload.length
  const buf = new Uint8Array(FRAME_HEADER_LEN + len + 2)
  const dv = new DataView(buf.buffer)
  buf[0] = LFP_SOF[0]
  buf[1] = LFP_SOF[1]
  buf[2] = LFP_VER
  buf[3] = type
  buf[4] = seq
  dv.setUint16(5, len, true)
  buf.set(payload, 7)
  const crc = crc16CcittFalse(buf.subarray(2, 7 + len))
  dv.setUint16(7 + len, crc, true)
  return buf
}

export function parseFrame(buffer: Uint8Array): { frame: LfpFrame; consumed: number } | null {
  if (buffer.length < FRAME_HEADER_LEN) return null
  let i = 0
  while (i <= buffer.length - FRAME_HEADER_LEN) {
    while (i <= buffer.length - 2 && (buffer[i] !== LFP_SOF[0] || buffer[i + 1] !== LFP_SOF[1])) {
      i++
    }
    if (i > buffer.length - FRAME_HEADER_LEN) return null
    const dv = new DataView(buffer.buffer, buffer.byteOffset + i)
    const len = dv.getUint16(5, true)
    const total = FRAME_HEADER_LEN + len + 2
    if (i + total > buffer.length) return null
    const crcStored = dv.getUint16(7 + len, true)
    const crcComputed = crc16CcittFalse(buffer.subarray(i + 2, i + 7 + len))
    if (crcStored !== crcComputed) {
      i += 2
      continue
    }
    const type = buffer[i + 3]
    const seq = buffer[i + 4]
    const payload = buffer.slice(i + 7, i + 7 + len)
    return {
      frame: { type, seq, payload },
      consumed: i + total,
    }
  }
  return null
}

export function encodeHello(clientId: number): Uint8Array {
  const buf = new ArrayBuffer(4)
  new DataView(buf).setUint32(0, clientId >>> 0, true)
  return new Uint8Array(buf)
}

export function decodeHelloAck(payload: Uint8Array): { fwVersion: number; pageSizeSupported: number; maxWindow: number } {
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.length)
  return {
    fwVersion: dv.getUint16(0, true),
    pageSizeSupported: dv.getUint16(2, true),
    maxWindow: payload[4] ?? 8,
  }
}

export const FILE_TYPE_LFP = 1
export const PAGE_SIZE = 512

export function encodeBegin(fileSize: number, fileCrc32: number, slotId: number, sessionId: number): Uint8Array {
  const buf = new ArrayBuffer(19)
  const dv = new DataView(buf)
  dv.setUint16(0, FILE_TYPE_LFP, true)
  dv.setUint32(2, fileSize >>> 0, true)
  dv.setUint32(6, fileCrc32 >>> 0, true)
  dv.setUint16(10, PAGE_SIZE, true)
  dv.setUint16(12, Math.ceil(fileSize / PAGE_SIZE), true)
  dv.setUint8(14, slotId)
  dv.setUint32(15, sessionId >>> 0, true)
  return new Uint8Array(buf)
}

export function decodeBeginAck(payload: Uint8Array): { sessionId: number; resumeMode: number; nextRequiredPage: number } {
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.length)
  return {
    sessionId: dv.getUint32(0, true),
    resumeMode: payload[4] ?? 0,
    nextRequiredPage: dv.getUint16(5, true),
  }
}

export function encodeData(sessionId: number, pageIndex: number, pageLen: number, pageCrc32: number, pageData: Uint8Array): Uint8Array {
  const buf = new Uint8Array(12 + pageData.length)
  const dv = new DataView(buf.buffer)
  dv.setUint32(0, sessionId >>> 0, true)
  dv.setUint16(4, pageIndex, true)
  dv.setUint16(6, pageLen, true)
  dv.setUint32(8, pageCrc32 >>> 0, true)
  buf.set(pageData, 12)
  return buf
}

export function decodeAck(payload: Uint8Array): { sessionId: number; ackBase: number } {
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.length)
  return { sessionId: dv.getUint32(0, true), ackBase: dv.getUint16(4, true) }
}

export function decodeNack(payload: Uint8Array): { sessionId: number; pageIndex: number } {
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.length)
  return { sessionId: dv.getUint32(0, true), pageIndex: dv.getUint16(4, true) }
}

export function encodeEnd(sessionId: number): Uint8Array {
  const buf = new ArrayBuffer(4)
  new DataView(buf).setUint32(0, sessionId >>> 0, true)
  return new Uint8Array(buf)
}

export const END_ACK_STATUS_OK = 0
export const END_ACK_STATUS_ERR = 1

export function decodeEndAck(payload: Uint8Array): { sessionId: number; status: number; errorCode: number } {
  return {
    sessionId: new DataView(payload.buffer, payload.byteOffset, 4).getUint32(0, true),
    status: payload[4] ?? END_ACK_STATUS_ERR,
    errorCode: payload[5] ?? 0,
  }
}

export function crc32File(data: Uint8Array): number {
  return crc32(data)
}

export function crc32Page(pageData: Uint8Array): number {
  return crc32(pageData)
}

