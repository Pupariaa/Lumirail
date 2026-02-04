import type { SerialConnectionState } from './types'
import type { LfpFrame } from './lfpTransport'
import {
  buildFrame,
  parseFrame,
  encodeHello,
  decodeHelloAck,
  encodeBegin,
  decodeBeginAck,
  encodeData,
  decodeAck,
  decodeNack,
  encodeEnd,
  decodeEndAck,
  crc32File,
  crc32Page,
  PAGE_SIZE,
  MSG_HELLO,
  MSG_HELLO_ACK,
  MSG_BEGIN,
  MSG_BEGIN_ACK,
  MSG_DATA,
  MSG_ACK,
  MSG_NACK,
  MSG_END,
  MSG_END_ACK,
} from './lfpTransport'

export interface ModuleInfo {
  board: Record<string, string>
  config: Record<string, string>
  s1Meta: Record<string, string>
  s2Meta: Record<string, string>
}

const BAUD_RATE = 115200
const INIT_DELAY_MS = 100
const SIGNALS_DELAY_MS = 200
const DIGIKEYPING_DELAY_MS = 300
const PRESENCE_PING_MS = 1000
const MODULE_DISCONNECT_MS = 3000
const PRESENCE_PING_START_DELAY_MS = 500

type Listener = (state: SerialConnectionState) => void
type ModulePresenceListener = (present: boolean) => void

let port: SerialPort | null = null
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
let state: SerialConnectionState = 'disconnected'
let messageBuffer = ''
let incomingByteBuffer = new Uint8Array(0)
const listeners = new Set<Listener>()
const modulePresenceListeners = new Set<ModulePresenceListener>()
let lastPongMs = 0
let modulePresent = false
let presencePingIntervalId: ReturnType<typeof setInterval> | null = null

let lfpFrameHandler: ((frame: LfpFrame) => void) | null = null

type ModuleInfoResolve = (value: ModuleInfo) => void
type ModuleInfoReject = (reason: Error) => void
let moduleInfoResolve: ModuleInfoResolve | null = null
let moduleInfoReject: ModuleInfoReject | null = null
type ScanState = 'idle' | 'config' | 'board' | 's1mt' | 's2mt'
let scanState: ScanState = 'idle'
let scanBuffer: string[] = []
let scanTimeoutId: ReturnType<typeof setTimeout> | null = null
let scanCollected: Partial<ModuleInfo> = {}

let setConfigResolve: ((ok: boolean) => void) | null = null
let setConfigReject: ((reason: Error) => void) | null = null

let sceneReadyResolve: (() => void) | null = null
let sceneSizeAckResolve: (() => void) | null = null
let sceneDoneResolve: (() => void) | null = null
let sceneMetaSetResolve: ((ok: boolean) => void) | null = null
let uploadInProgress = false

let sceneUploadReadyResolve: (() => void) | null = null
let sceneBlockOkResolve: (() => void) | null = null
let sceneBlockOkReject: ((reason: Error) => void) | null = null
let sceneBlockOkExpectedIndex = -1
let sceneHashFromBridgeResolve: ((value: { crc: string; hash: string }) => void) | null = null
let sceneUploadResolve: ((value: { ok: boolean; msg?: string }) => void) | null = null

const SCAN_TIMEOUT_MS = 15000
const SCENE_READY_TIMEOUT_MS = 5000
const SCENE_SIZE_ACK_TIMEOUT_MS = 5000
const SCENE_DONE_TIMEOUT_MS = 8000
const SCENE_META_SET_TIMEOUT_MS = 5000
const SCENE_CHUNK = 64
const SCENE_CHUNK_DELAY_MS = 12
const BRIDGE_SCENE_BLOCK_SIZE = 256
const SCENE_UPLOAD_READY_TIMEOUT_MS = 5000
const SCENE_BLOCK_OK_TIMEOUT_MS = 5000
const SCENE_GET_HASH_TIMEOUT_MS = 5000
const SCENE_SEND_TO_MODULE_TIMEOUT_MS = 60000

export const LFP_BLOCK_SIZE = PAGE_SIZE

const UPLOAD_ESTIMATE_MS_PER_KB = 219
const UPLOAD_ESTIMATE_FIXED_MS = 8420

export function estimateUploadTimeMs(dataBytes: number): number {
  const sizeKb = dataBytes / 1024
  return Math.round(sizeKb * UPLOAD_ESTIMATE_MS_PER_KB + UPLOAD_ESTIMATE_FIXED_MS)
}

function randomU32(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) >>> 0
  }
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) >>> 0
}

function parseKeyValueLines(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of lines) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.substring(0, idx).trim()
    const value = line.substring(idx + 1).trim().replace(/;\s*$/, '')
    if (!key) continue
    if (value.length > (out[key] ?? '').length) out[key] = value
  }
  return out
}

function resetScanWaiting(): void {
  moduleInfoResolve = null
  moduleInfoReject = null
  scanState = 'idle'
  scanBuffer = []
  scanCollected = {}
  if (scanTimeoutId) {
    clearTimeout(scanTimeoutId)
    scanTimeoutId = null
  }
}

function finishScan(): void {
  if (moduleInfoResolve && scanCollected.board) {
    moduleInfoResolve({
      board: scanCollected.board ?? {},
      config: scanCollected.config ?? {},
      s1Meta: scanCollected.s1Meta ?? {},
      s2Meta: scanCollected.s2Meta ?? {},
    })
  } else if (moduleInfoReject) {
    moduleInfoReject(new Error('Incomplete module scan'))
  }
  resetScanWaiting()
}

function notifyModulePresence(present: boolean): void {
  if (modulePresent === present) return
  modulePresent = present
  modulePresenceListeners.forEach((cb) => cb(present))
}

function processLine(trimmed: string): void {
  if (trimmed === 'PONG') {
    lastPongMs = Date.now()
    notifyModulePresence(true)
  }
  if (setConfigResolve !== null) {
    if (trimmed === 'SETCONFIG_OK') {
      const r = setConfigResolve
      setConfigResolve = null
      setConfigReject = null
      r(true)
    } else if (trimmed.startsWith('SETCONFIG_ERR')) {
      const r = setConfigReject
      setConfigResolve = null
      setConfigReject = null
      r?.(new Error(trimmed))
    }
  }
  if (trimmed === 'SCENE_READY' && sceneReadyResolve) {
    sceneReadyResolve()
    sceneReadyResolve = null
  } else if (trimmed === 'SCENE_SIZE_ACK' && sceneSizeAckResolve) {
    sceneSizeAckResolve()
    sceneSizeAckResolve = null
  } else if (trimmed === 'SCENE_DONE' && sceneDoneResolve) {
    sceneDoneResolve()
    sceneDoneResolve = null
  } else if (trimmed === 'SET_SCENE_META_OK' && sceneMetaSetResolve) {
    sceneMetaSetResolve(true)
    sceneMetaSetResolve = null
  } else if (trimmed === 'SET_SCENE_META_ERR' && sceneMetaSetResolve) {
    sceneMetaSetResolve(false)
    sceneMetaSetResolve = null
  } else if (trimmed === 'SCENE_UPLOAD_READY' && sceneUploadReadyResolve) {
    sceneUploadReadyResolve()
    sceneUploadReadyResolve = null
  } else if (trimmed.startsWith('SCENE_BLOCK_OK:') && sceneBlockOkResolve) {
    const m = trimmed.match(/^SCENE_BLOCK_OK:(\d+)$/)
    const idx = m ? parseInt(m[1] ?? '', 10) : -1
    if (idx === sceneBlockOkExpectedIndex) {
      sceneBlockOkResolve()
      sceneBlockOkResolve = null
      sceneBlockOkReject = null
      sceneBlockOkExpectedIndex = -1
    }
  } else if (trimmed.startsWith('SCENE_BLOCK_ERR:') && sceneBlockOkReject) {
    const m = trimmed.match(/^SCENE_BLOCK_ERR:(\d+)$/)
    const idx = m ? parseInt(m[1] ?? '', 10) : -1
    if (idx === sceneBlockOkExpectedIndex) {
      const r = sceneBlockOkReject
      sceneBlockOkResolve = null
      sceneBlockOkReject = null
      sceneBlockOkExpectedIndex = -1
      r(new Error('SCENE_BLOCK_ERR:' + idx))
    }
  } else if (trimmed.startsWith('SCENE_HASH:') && sceneHashFromBridgeResolve) {
    const m = trimmed.match(/^SCENE_HASH:([0-9a-fA-F]{8}):([0-9a-fA-F]{64})$/)
    if (m) {
      sceneHashFromBridgeResolve({ crc: (m[1] ?? '').toLowerCase(), hash: (m[2] ?? '').toLowerCase() })
      sceneHashFromBridgeResolve = null
    }
  } else if (trimmed.startsWith('SCENE_OK') && sceneUploadResolve) {
    sceneUploadResolve({ ok: true })
    sceneUploadResolve = null
  } else if (trimmed.startsWith('SCENE_ERR') && sceneUploadResolve) {
    sceneUploadResolve({ ok: false, msg: trimmed })
    sceneUploadResolve = null
  } else if (trimmed.startsWith('SCENE_BRIDGE_ERR:') && sceneUploadResolve) {
    sceneUploadResolve({ ok: false, msg: trimmed })
    sceneUploadResolve = null
  }
  if (scanState === 'idle') return
  if (scanState === 'config') {
    if (trimmed.startsWith('CONFEND:')) {
      scanCollected.config = parseKeyValueLines(scanBuffer)
      scanBuffer = []
      scanState = 'board'
    } else if (trimmed.includes(':') && !trimmed.startsWith('CONFEND:')) {
      scanBuffer.push(trimmed)
    }
    return
  }
  if (scanState === 'board') {
    if (trimmed.startsWith('BOARDEND:')) {
      scanCollected.board = parseKeyValueLines(scanBuffer)
      scanBuffer = []
      scanState = 's1mt'
    } else if (trimmed.includes(':') && !trimmed.startsWith('BOARDEND:')) {
      scanBuffer.push(trimmed)
    }
    return
  }
  if (scanState === 's1mt') {
    if (trimmed.startsWith('S1MTEND:')) {
      scanCollected.s1Meta = parseKeyValueLines(scanBuffer)
      scanBuffer = []
      scanState = 's2mt'
    } else if (trimmed.includes(':') && !trimmed.startsWith('S1MTEND:')) {
      scanBuffer.push(trimmed)
    }
    return
  }
  if (scanState === 's2mt') {
    if (trimmed.startsWith('S2MTEND:')) {
      scanCollected.s2Meta = parseKeyValueLines(scanBuffer)
      finishScan()
    } else if (trimmed.includes(':') && !trimmed.startsWith('S2MTEND:')) {
      scanBuffer.push(trimmed)
    }
  }
}

function getSerial(): Serial | undefined {
  return typeof navigator !== 'undefined' ? navigator.serial : undefined
}

function setState(next: SerialConnectionState) {
  if (state === next) return
  state = next
  listeners.forEach((cb) => cb(state))
}

function getState(): SerialConnectionState {
  return state
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function subscribeModulePresence(listener: ModulePresenceListener): () => void {
  modulePresenceListeners.add(listener)
  return () => modulePresenceListeners.delete(listener)
}

function getModulePresent(): boolean {
  return modulePresent
}

function isTaskInProgress(): boolean {
  return uploadInProgress || scanState !== 'idle' || setConfigResolve !== null ||
    sceneReadyResolve !== null || sceneSizeAckResolve !== null ||
    sceneDoneResolve !== null || sceneMetaSetResolve !== null
}

function startPresencePing(): void {
  if (presencePingIntervalId) return
  lastPongMs = 0
  modulePresent = false
  presencePingIntervalId = setInterval(() => {
    if (!port?.writable || isTaskInProgress()) return
    if (lastPongMs > 0 && Date.now() - lastPongMs > MODULE_DISCONNECT_MS) {
      notifyModulePresence(false)
    }
    sendMessage('PING')
  }, PRESENCE_PING_MS)
}

function stopPresencePing(): void {
  if (presencePingIntervalId) {
    clearInterval(presencePingIntervalId)
    presencePingIntervalId = null
  }
  lastPongMs = 0
  modulePresent = false
  notifyModulePresence(false)
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b
  if (b.length === 0) return a
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

function indexOfSof(buf: Uint8Array): number {
  for (let i = 0; i + 1 < buf.length; i++) {
    if (buf[i] === 0x55 && buf[i + 1] === 0xaa) return i
  }
  return -1
}

function processTextBytes(bytes: Uint8Array, decoder: TextDecoder): void {
  if (bytes.length === 0) return
  messageBuffer += decoder.decode(bytes, { stream: true })
  const lines = messageBuffer.split(/\r?\n/)
  messageBuffer = lines.pop() ?? ''
  for (const line of lines) {
    const trimmed = line.replace(/\r$/, '').trim()
    if (!trimmed) continue
    processLine(trimmed)
  }
}

async function readLoop(): Promise<void> {
  if (!reader || !port) return
  const decoder = new TextDecoder('utf-8', { fatal: false })
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value || value.length === 0) continue
      incomingByteBuffer = concatBytes(incomingByteBuffer, value)
      while (incomingByteBuffer.length > 0) {
        const sofIndex = indexOfSof(incomingByteBuffer)
        if (sofIndex < 0) {
          const keepLast = incomingByteBuffer[incomingByteBuffer.length - 1] === 0x55 ? 1 : 0
          const flushLen = incomingByteBuffer.length - keepLast
          if (flushLen > 0) {
            processTextBytes(incomingByteBuffer.subarray(0, flushLen), decoder)
          }
          incomingByteBuffer = keepLast ? incomingByteBuffer.subarray(incomingByteBuffer.length - 1) : new Uint8Array(0)
          break
        }
        if (sofIndex > 0) {
          processTextBytes(incomingByteBuffer.subarray(0, sofIndex), decoder)
          incomingByteBuffer = incomingByteBuffer.subarray(sofIndex)
          continue
        }
        const parsed = parseFrame(incomingByteBuffer)
        if (!parsed) break
        lfpFrameHandler?.(parsed.frame)
        incomingByteBuffer = incomingByteBuffer.subarray(parsed.consumed)
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'NetworkError') {
      console.error('Serial read error:', (err as Error).message)
    }
  } finally {
    const miReject = moduleInfoReject
    const cfgReject = setConfigReject
    moduleInfoResolve = null
    moduleInfoReject = null
    setConfigResolve = null
    setConfigReject = null
    resetScanWaiting()
    miReject?.(new Error('Connection closed'))
    cfgReject?.(new Error('Connection closed'))
    lfpFrameHandler = null
    incomingByteBuffer = new Uint8Array(0)
    if (reader) {
      reader.releaseLock()
      reader = null
    }
  }
}

async function sendMessage(message: string): Promise<void> {
  if (!port?.writable) return
  const writer = port.writable.getWriter()
  try {
    await writer.write(new TextEncoder().encode(message + '\n'))
    await writer.ready
  } finally {
    writer.releaseLock()
  }
}

async function connect(): Promise<void> {
  const serial = getSerial()
  if (!serial) {
    throw new Error('Web Serial is not supported')
  }
  if (state !== 'disconnected') return
  setState('connecting')
  try {
    const p = await serial.requestPort()
    await p.open({ baudRate: BAUD_RATE })
    port = p
    await new Promise((r) => setTimeout(r, INIT_DELAY_MS))
    if (typeof p.setSignals === 'function') {
      await p.setSignals({ dataTerminalReady: true, requestToSend: false })
      await new Promise((r) => setTimeout(r, SIGNALS_DELAY_MS))
    }
    reader = p.readable.getReader()
    readLoop()
    messageBuffer = ''
    incomingByteBuffer = new Uint8Array(0)
    lfpFrameHandler = null
    setState('connected')
    await new Promise((r) => setTimeout(r, DIGIKEYPING_DELAY_MS))
    await sendMessage('DIGIKEYPING')
    await new Promise((r) => setTimeout(r, PRESENCE_PING_START_DELAY_MS))
    startPresencePing()
  } catch (err) {
    setState('disconnected')
    port = null
    reader = null
    throw err
  }
}

async function disconnect(): Promise<void> {
  stopPresencePing()
  if (reader) {
    await reader.cancel()
    reader = null
  }
  if (port) {
    await port.close()
    port = null
  }
  messageBuffer = ''
  incomingByteBuffer = new Uint8Array(0)
  const miReject = moduleInfoReject
  const cfgReject = setConfigReject
  moduleInfoResolve = null
  moduleInfoReject = null
  setConfigResolve = null
  setConfigReject = null
  resetScanWaiting()
  miReject?.(new Error('Disconnected'))
  cfgReject?.(new Error('Disconnected'))
  lfpFrameHandler = null
  setState('disconnected')
}

async function getModuleInfo(): Promise<ModuleInfo> {
  if (state !== 'connected' || !port?.writable) {
    throw new Error('DigiKey not connected')
  }
  if (uploadInProgress) {
    throw new Error('Upload already in progress')
  }
  if (scanState !== 'idle') {
    throw new Error('Scan already in progress')
  }
  return new Promise<ModuleInfo>((resolve, reject) => {
    moduleInfoResolve = resolve
    moduleInfoReject = reject
    scanState = 'config'
    scanBuffer = []
    scanCollected = {}
    scanTimeoutId = setTimeout(() => {
      resetScanWaiting()
      reject(new Error('Scan timeout'))
    }, SCAN_TIMEOUT_MS)
    sendMessage('PING')
      .then(() => new Promise((r) => setTimeout(r, 400)))
      .then(() => sendMessage('GETCONFIG'))
      .catch((err) => {
        resetScanWaiting()
        reject(err)
      })
  })
}

async function getBoardInfo(): Promise<Record<string, string>> {
  const info = await getModuleInfo()
  return info.board
}

async function getBoardSerial(): Promise<string> {
  const info = await getModuleInfo()
  return (info.board['SN'] ?? '').trim()
}

async function setConfig(key: string, value: string | number): Promise<boolean> {
  if (state !== 'connected' || !port?.writable) {
    throw new Error('DigiKey not connected')
  }
  if (setConfigResolve !== null) {
    throw new Error('SetConfig already in progress')
  }
  const valueStr = String(value)
  return new Promise<boolean>((resolve, reject) => {
    setConfigResolve = resolve
    setConfigReject = reject
    sendMessage(`SETCONFIG:${key}:${valueStr}`).catch((err) => {
      setConfigResolve = null
      setConfigReject = null
      reject(err)
    })
  })
}

function isSupported(): boolean {
  return !!getSerial()
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface UploadSceneOptions {
  slot: 1 | 2
  sop: boolean
  loop: boolean
  onProgress?: (pct: number) => void
}

async function uploadScene(
  sceneText: string,
  options: UploadSceneOptions
): Promise<void> {
  if (state !== 'connected' || !port?.writable) {
    throw new Error('DigiKey not connected')
  }
  if (uploadInProgress) throw new Error('Upload already in progress')
  uploadInProgress = true
  try {
    const { slot, sop, loop, onProgress } = options
    const data = new TextEncoder().encode(sceneText)
    onProgress?.(0)
  await sendMessage('PING')
  await new Promise((r) => setTimeout(r, 400))
  await sendMessage('GETCONFIG')
  await new Promise((r) => setTimeout(r, 400))
  await sendMessage('SCENE_SLOT:' + slot)
  await new Promise((r) => setTimeout(r, 50))
  await sendMessage('SCENE_READY?')
  await new Promise<void>((resolve, reject) => {
    sceneReadyResolve = resolve
    setTimeout(() => {
      if (sceneReadyResolve) {
        sceneReadyResolve = null
        reject(new Error('SCENE_READY timeout'))
      }
    }, SCENE_READY_TIMEOUT_MS)
  })
  await sendMessage('SCENE_SIZE:' + data.length)
  await new Promise<void>((resolve, reject) => {
    sceneSizeAckResolve = resolve
    setTimeout(() => {
      if (sceneSizeAckResolve) {
        sceneSizeAckResolve = null
        reject(new Error('SCENE_SIZE_ACK timeout'))
      }
    }, SCENE_SIZE_ACK_TIMEOUT_MS)
  })
  await new Promise((r) => setTimeout(r, 50))
  const writer = port.writable.getWriter()
  try {
    let sent = 0
    while (sent < data.length) {
      const end = Math.min(sent + SCENE_CHUNK, data.length)
      await writer.write(data.subarray(sent, end))
      sent = end
      onProgress?.(Math.round((sent / data.length) * 100))
      await new Promise((r) => setTimeout(r, SCENE_CHUNK_DELAY_MS))
    }
  } finally {
    writer.releaseLock()
  }
  await sendMessage('')
  await sendMessage('SCENE_END')
  await new Promise<void>((resolve, reject) => {
    sceneDoneResolve = resolve
    setTimeout(() => {
      if (sceneDoneResolve) {
        sceneDoneResolve = null
        reject(new Error('SCENE_DONE timeout'))
      }
    }, SCENE_DONE_TIMEOUT_MS)
  })
  const hashBuf = await crypto.subtle.digest('SHA-256', data)
  const hashHex = bytesToHex(new Uint8Array(hashBuf)).toLowerCase()
  await sendMessage('SET_SCENE_META:' + slot + ':' + hashHex + ':' + data.length)
  const metaOk = await new Promise<boolean>((resolve, reject) => {
    sceneMetaSetResolve = resolve
    setTimeout(() => {
      if (sceneMetaSetResolve) {
        sceneMetaSetResolve = null
        reject(new Error('SET_SCENE_META timeout'))
      }
    }, SCENE_META_SET_TIMEOUT_MS)
  })
  if (!metaOk) throw new Error('Metadata update failed')
  await setConfig('SOP', sop ? 1 : 0)
  await setConfig('scene_active', slot)
  onProgress?.(100)
  } finally {
    uploadInProgress = false
  }
}

export type UploadLfpPhase = 1 | 2 | 3

export interface UploadLfpOptions {
  slot: 1 | 2
  onProgress?: (pct: number, phase?: UploadLfpPhase, rateKbPerS?: number) => void
}

function waitForSceneUploadReady(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      sceneUploadReadyResolve = null
      reject(new Error('SCENE_UPLOAD_READY timeout'))
    }, timeoutMs)
    sceneUploadReadyResolve = () => {
      clearTimeout(t)
      sceneUploadReadyResolve = null
      resolve()
    }
  })
}

function waitForSceneBlockOk(expectedIndex: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      sceneBlockOkResolve = null
      sceneBlockOkReject = null
      sceneBlockOkExpectedIndex = -1
      reject(new Error('SCENE_BLOCK_OK:' + expectedIndex + ' timeout'))
    }, timeoutMs)
    sceneBlockOkExpectedIndex = expectedIndex
    sceneBlockOkResolve = () => {
      clearTimeout(t)
      resolve()
    }
    sceneBlockOkReject = (err) => {
      clearTimeout(t)
      reject(err)
    }
  })
}

function waitForSceneHashFromBridge(timeoutMs: number): Promise<{ crc: string; hash: string }> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      sceneHashFromBridgeResolve = null
      reject(new Error('SCENE_GET_HASH timeout'))
    }, timeoutMs)
    sceneHashFromBridgeResolve = (v) => {
      clearTimeout(t)
      sceneHashFromBridgeResolve = null
      resolve(v)
    }
  })
}

function waitForSceneResult(timeoutMs: number): Promise<{ ok: boolean; msg?: string }> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      sceneUploadResolve = null
      reject(new Error('timeout'))
    }, timeoutMs)
    sceneUploadResolve = (v) => {
      clearTimeout(t)
      sceneUploadResolve = null
      resolve(v)
    }
  })
}

async function uploadLfpViaBridge(lfpBuffer: ArrayBuffer, onProgress?: UploadLfpOptions['onProgress']): Promise<void> {
  if (state !== 'connected' || !port?.writable) {
    throw new Error('DigiKey not connected')
  }
  const data = new Uint8Array(lfpBuffer)
  const totalSize = data.length
  if (totalSize === 0 || totalSize > 4 * 1024 * 1024) {
    throw new Error('Invalid file size')
  }

  onProgress?.(0, 1)

  const fileCrcHex = (crc32File(data) >>> 0).toString(16).padStart(8, '0').toLowerCase()
  const hashBuf = await crypto.subtle.digest('SHA-256', data)
  const hashHex = bytesToHex(new Uint8Array(hashBuf)).toLowerCase()
  const numBlocks = Math.ceil(totalSize / BRIDGE_SCENE_BLOCK_SIZE)

  await sendMessage('SCENE_UPLOAD_START:' + totalSize)
  await waitForSceneUploadReady(SCENE_UPLOAD_READY_TIMEOUT_MS)

  onProgress?.(0, 2)
  const startedAt = Date.now()
  const writer = port.writable.getWriter()
  try {
    const textEncoder = new TextEncoder()
    for (let i = 0; i < numBlocks; i++) {
      const blockStart = i * BRIDGE_SCENE_BLOCK_SIZE
      const blockEnd = Math.min(blockStart + BRIDGE_SCENE_BLOCK_SIZE, totalSize)
      const block = data.subarray(blockStart, blockEnd)
      const blockLen = block.length
      const crcHex = (crc32Page(block) >>> 0).toString(16).padStart(8, '0').toLowerCase()
      const line = `SCENE_BLOCK:${i}:${blockLen}:${crcHex}\n`
      await writer.write(textEncoder.encode(line))
      await writer.write(block)
      await waitForSceneBlockOk(i, SCENE_BLOCK_OK_TIMEOUT_MS)
      const pct = Math.round(((i + 1) / numBlocks) * 100)
      const elapsedS = Math.max(0.001, (Date.now() - startedAt) / 1000)
      const bytesSent = Math.min(totalSize, (i + 1) * BRIDGE_SCENE_BLOCK_SIZE)
      const rateKbPerS = (bytesSent / 1024) / elapsedS
      onProgress?.(Math.min(99, pct), 2, rateKbPerS)
    }
  } finally {
    writer.releaseLock()
  }

  onProgress?.(99, 3)
  await sendMessage('SCENE_GET_HASH')
  const hashResult = await waitForSceneHashFromBridge(SCENE_GET_HASH_TIMEOUT_MS)
  if (hashResult.crc.toLowerCase() !== fileCrcHex || hashResult.hash.toLowerCase() !== hashHex) {
    throw new Error('Bridge verify failed')
  }

  await sendMessage('SCENE_SEND_TO_MODULE:' + hashHex)
  const res = await waitForSceneResult(SCENE_SEND_TO_MODULE_TIMEOUT_MS)
  if (!res.ok) throw new Error(res.msg ?? 'Module failed')
  onProgress?.(100, 3)
}

async function uploadLfp(lfpBuffer: ArrayBuffer, options: UploadLfpOptions): Promise<void> {
  if (state !== 'connected' || !port?.writable) {
    throw new Error('DigiKey not connected')
  }
  if (uploadInProgress) throw new Error('Upload already in progress')
  uploadInProgress = true
  try {
    const { slot, onProgress } = options
    const data = new Uint8Array(lfpBuffer)
    const totalSize = data.length
    if (totalSize === 0 || totalSize > 4 * 1024 * 1024) {
      throw new Error('Invalid file size')
    }

    await sendMessage('PING')
    await new Promise((r) => setTimeout(r, 120))

    try {
      await uploadLfpViaBridge(lfpBuffer, onProgress)
      return
    } catch (err) {
      const msg = (err as Error).message
      if (msg !== 'SCENE_UPLOAD_READY timeout') throw err
    }

    const uploadBinary = async () => {
      const fileCrc32 = crc32File(data)
      const sessionId = randomU32()
      const clientId = randomU32()
      const pageCount = Math.ceil(totalSize / PAGE_SIZE)
      const startedAt = Date.now()

      type UploadEvent =
        | { kind: 'ack'; ackBase: number }
        | { kind: 'nack'; pageIndex: number }
        | { kind: 'endAck'; status: number; errorCode: number }

      const queue: UploadEvent[] = []
      let waiterResolve: ((ev: UploadEvent) => void) | null = null
      let waiterReject: ((err: Error) => void) | null = null
      let helloAckResolve: ((ack: ReturnType<typeof decodeHelloAck>) => void) | null = null
      let beginAckResolve: ((ack: ReturnType<typeof decodeBeginAck>) => void) | null = null

      const pushEvent = (ev: UploadEvent) => {
        if (waiterResolve) {
          const r = waiterResolve
          waiterResolve = null
          waiterReject = null
          r(ev)
        } else {
          queue.push(ev)
        }
      }

      const waitEvent = (timeoutMs: number) => {
        if (queue.length) return Promise.resolve(queue.shift()!)
        return new Promise<UploadEvent>((resolve, reject) => {
          const t = setTimeout(() => {
            if (waiterReject) waiterReject = null
            waiterResolve = null
            reject(new Error('Upload timeout'))
          }, timeoutMs)
          waiterResolve = (ev) => {
            clearTimeout(t)
            resolve(ev)
          }
          waiterReject = (err) => {
            clearTimeout(t)
            reject(err)
          }
        })
      }

      const waitHelloAck = (timeoutMs: number) => {
        return new Promise<ReturnType<typeof decodeHelloAck>>((resolve, reject) => {
          const t = setTimeout(() => {
            helloAckResolve = null
            reject(new Error('HELLO timeout'))
          }, timeoutMs)
          helloAckResolve = (ack) => {
            clearTimeout(t)
            helloAckResolve = null
            resolve(ack)
          }
        })
      }

      const waitBeginAck = (timeoutMs: number) => {
        return new Promise<ReturnType<typeof decodeBeginAck>>((resolve, reject) => {
          const t = setTimeout(() => {
            beginAckResolve = null
            reject(new Error('BEGIN timeout'))
          }, timeoutMs)
          beginAckResolve = (ack) => {
            clearTimeout(t)
            beginAckResolve = null
            resolve(ack)
          }
        })
      }

      const waitForEndAck = async (timeoutMs: number) => {
        const deadline = Date.now() + timeoutMs
        while (true) {
          const remaining = deadline - Date.now()
          if (remaining <= 0) throw new Error('END_ACK timeout')
          const ev = await waitEvent(remaining)
          if (ev.kind === 'endAck') return ev
        }
      }

      onProgress?.(0, 1)

      let seq = 0
      const writer = port!.writable!.getWriter()
      try {
        lfpFrameHandler = (frame) => {
          if (frame.type === MSG_HELLO_ACK) {
            const a = helloAckResolve
            if (a) a(decodeHelloAck(frame.payload))
            return
          }
          if (frame.type === MSG_BEGIN_ACK) {
            const a = beginAckResolve
            if (a) a(decodeBeginAck(frame.payload))
            return
          }
          if (frame.type === MSG_ACK) {
            const a = decodeAck(frame.payload)
            if ((a.sessionId >>> 0) === (sessionId >>> 0)) pushEvent({ kind: 'ack', ackBase: a.ackBase })
            return
          }
          if (frame.type === MSG_NACK) {
            const n = decodeNack(frame.payload)
            if ((n.sessionId >>> 0) === (sessionId >>> 0)) pushEvent({ kind: 'nack', pageIndex: n.pageIndex })
            return
          }
          if (frame.type === MSG_END_ACK) {
            const e = decodeEndAck(frame.payload)
            if ((e.sessionId >>> 0) === (sessionId >>> 0)) pushEvent({ kind: 'endAck', status: e.status, errorCode: e.errorCode })
          }
        }

        const writeFrame = async (type: number, payload: Uint8Array) => {
          const b = buildFrame(type, seq & 0xff, payload)
          seq = (seq + 1) & 0xff
          await writer.write(b)
          await writer.ready
        }

        let helloAck: ReturnType<typeof decodeHelloAck> | null = null
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await writeFrame(MSG_HELLO, encodeHello(clientId))
            helloAck = await waitHelloAck(2500)
            break
          } catch (err) {
            const msg = (err as Error).message
            if (msg === 'HELLO timeout' && attempt < 2) {
              await new Promise((r) => setTimeout(r, 200))
              continue
            }
            throw err
          }
        }
        if (!helloAck) throw new Error('HELLO timeout')
        const maxWindow = Math.max(1, Math.min(32, helloAck.maxWindow || 8))

        await writeFrame(MSG_BEGIN, encodeBegin(totalSize, fileCrc32, slot, sessionId))
        const beginAck = await waitBeginAck(3000)
        if ((beginAck.sessionId >>> 0) !== (sessionId >>> 0)) {
          throw new Error('BEGIN_ACK session mismatch')
        }

        const sendPage = async (pageIndex: number) => {
          const start = pageIndex * PAGE_SIZE
          if (start >= totalSize) return
          const end = Math.min(start + PAGE_SIZE, totalSize)
          const page = data.subarray(start, end)
          const pageCrc = crc32Page(page)
          await writeFrame(MSG_DATA, encodeData(sessionId, pageIndex, page.length, pageCrc, page))
        }

        let base = Math.max(0, Math.min(pageCount, beginAck.nextRequiredPage))
        let next = base

        while (base < pageCount) {
          while (next < pageCount && next - base < maxWindow) {
            await sendPage(next)
            next++
          }

          const ev = await waitEvent(5000)
          if (ev.kind === 'ack') {
            const nextBase = Math.max(base, Math.min(pageCount, ev.ackBase))
            base = nextBase
            if (next < base) next = base
          } else if (ev.kind === 'nack') {
            await sendPage(ev.pageIndex)
          }

          const bytesAcked = Math.min(totalSize, base * PAGE_SIZE)
          const elapsedS = Math.max(0.001, (Date.now() - startedAt) / 1000)
          const rateKbPerS = (bytesAcked / 1024) / elapsedS
          const pct = Math.round((bytesAcked / totalSize) * 100)
          onProgress?.(Math.min(99, pct), 2, rateKbPerS)
        }

        onProgress?.(99, 3)
        await writeFrame(MSG_END, encodeEnd(sessionId))
        const endAck = await waitForEndAck(8000)
        if (endAck.status !== 0) throw new Error('Upload failed: ' + endAck.errorCode)
        onProgress?.(100, 3)
      } finally {
        lfpFrameHandler = null
        writer.releaseLock()
      }
    }

    await uploadBinary()
  } finally {
    uploadInProgress = false
  }
}

export const serialConnection = {
  connect,
  disconnect,
  sendMessage,
  getBoardInfo,
  getModuleInfo,
  getBoardSerial,
  setConfig,
  getState,
  subscribe,
  subscribeModulePresence,
  getModulePresent,
  isSupported,
  uploadScene,
  uploadLfp,
}
