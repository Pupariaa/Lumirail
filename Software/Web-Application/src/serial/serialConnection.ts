import type { SerialConnectionState } from './types'
import { crc32 } from './crc32'

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
const listeners = new Set<Listener>()
const modulePresenceListeners = new Set<ModulePresenceListener>()
let lastPongMs = 0
let modulePresent = false
let presencePingIntervalId: ReturnType<typeof setInterval> | null = null

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
let sceneBlockOkReject: ((err: Error) => void) | null = null
let sceneBlockOkExpectedIndex: number | null = null
let sceneBlockOkTimeoutId: ReturnType<typeof setTimeout> | null = null
let sceneHashFromBridgeResolve: ((obj: { crc: string; hash: string }) => void) | null = null
let sceneHashFromBridgeTimeoutId: ReturnType<typeof setTimeout> | null = null
type SceneUploadResult = { ok: boolean; msg?: string }
let sceneUploadResultResolve: ((result: SceneUploadResult) => void) | null = null
let sceneUploadResultTimeoutId: ReturnType<typeof setTimeout> | null = null

const SCAN_TIMEOUT_MS = 15000
const SCENE_READY_TIMEOUT_MS = 5000
const SCENE_SIZE_ACK_TIMEOUT_MS = 5000
const SCENE_DONE_TIMEOUT_MS = 8000
const SCENE_META_SET_TIMEOUT_MS = 5000
const SCENE_CHUNK = 64
const SCENE_CHUNK_DELAY_MS = 12

export const LFP_BLOCK_SIZE = 256
const SCENE_UPLOAD_READY_TIMEOUT_MS = 5000
const SCENE_BLOCK_OK_TIMEOUT_MS = 5000
const SCENE_GET_HASH_TIMEOUT_MS = 5000
const SCENE_SEND_TO_MODULE_TIMEOUT_MS = 60000

const UPLOAD_ESTIMATE_MS_PER_KB = 219
const UPLOAD_ESTIMATE_FIXED_MS = 8420

const PHASE1_MS_PER_KB = 14.1
const PHASE1_FIXED_MS = 7040
const PHASE2_MS_PER_KB = 149.5
const PHASE3_MS_PER_KB = 55.5
const PHASE3_FIXED_MS = 1400

export function estimateUploadTimeMs(dataBytes: number): number {
  const sizeKb = dataBytes / 1024
  return Math.round(sizeKb * UPLOAD_ESTIMATE_MS_PER_KB + UPLOAD_ESTIMATE_FIXED_MS)
}

function getUploadPhaseMs(dataBytes: number): { totalMs: number; phase1Ms: number; phase2Ms: number; phase3Ms: number } {
  const sizeKb = dataBytes / 1024
  const phase1Ms = Math.round(sizeKb * PHASE1_MS_PER_KB + PHASE1_FIXED_MS)
  const phase2Ms = Math.round(sizeKb * PHASE2_MS_PER_KB)
  const phase3Ms = Math.round(sizeKb * PHASE3_MS_PER_KB + PHASE3_FIXED_MS)
  const totalMs = phase1Ms + phase2Ms + phase3Ms
  return { totalMs, phase1Ms, phase2Ms, phase3Ms }
}

function crc32BytesHex(bytes: Uint8Array): string {
  const c = crc32(bytes)
  return (c >>> 0).toString(16).padStart(8, '0').toLowerCase()
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
  }
  if (trimmed === 'SCENE_UPLOAD_READY' && sceneUploadReadyResolve) {
    sceneUploadReadyResolve()
    sceneUploadReadyResolve = null
  } else if (/^SCENE_HASH:[0-9a-fA-F]{8}:[0-9a-fA-F]{64}$/.test(trimmed)) {
    const parts = trimmed.split(':')
    if (parts.length === 3 && sceneHashFromBridgeResolve) {
      if (sceneHashFromBridgeTimeoutId) {
        clearTimeout(sceneHashFromBridgeTimeoutId)
        sceneHashFromBridgeTimeoutId = null
      }
      sceneHashFromBridgeResolve({ crc: parts[1], hash: parts[2] })
      sceneHashFromBridgeResolve = null
    }
  } else if (/^SCENE_BLOCK_ERR:\d+$/.test(trimmed)) {
    const m = trimmed.match(/^SCENE_BLOCK_ERR:(\d+)$/)
    const idx = m ? parseInt(m[1], 10) : -1
    if (sceneBlockOkReject !== null && sceneBlockOkExpectedIndex === idx) {
      if (sceneBlockOkTimeoutId) {
        clearTimeout(sceneBlockOkTimeoutId)
        sceneBlockOkTimeoutId = null
      }
      sceneBlockOkReject(new Error('SCENE_BLOCK_ERR:' + idx))
      sceneBlockOkResolve = null
      sceneBlockOkReject = null
      sceneBlockOkExpectedIndex = null
    }
  } else if (/^SCENE_BLOCK_OK:\d+$/.test(trimmed)) {
    const m = trimmed.match(/^SCENE_BLOCK_OK:(\d+)$/)
    const idx = m ? parseInt(m[1], 10) : -1
    if (sceneBlockOkResolve !== null && sceneBlockOkExpectedIndex === idx) {
      if (sceneBlockOkTimeoutId) {
        clearTimeout(sceneBlockOkTimeoutId)
        sceneBlockOkTimeoutId = null
      }
      sceneBlockOkResolve()
      sceneBlockOkResolve = null
      sceneBlockOkReject = null
      sceneBlockOkExpectedIndex = null
    }
  } else if (trimmed.startsWith('SCENE_OK')) {
    if (sceneUploadResultResolve) {
      if (sceneUploadResultTimeoutId) {
        clearTimeout(sceneUploadResultTimeoutId)
        sceneUploadResultTimeoutId = null
      }
      sceneUploadResultResolve({ ok: true })
      sceneUploadResultResolve = null
    }
  } else if (trimmed.startsWith('SCENE_ERR')) {
    if (sceneUploadResultResolve) {
      if (sceneUploadResultTimeoutId) {
        clearTimeout(sceneUploadResultTimeoutId)
        sceneUploadResultTimeoutId = null
      }
      sceneUploadResultResolve({ ok: false, msg: trimmed })
      sceneUploadResultResolve = null
    }
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
    sceneDoneResolve !== null || sceneMetaSetResolve !== null ||
    sceneUploadReadyResolve !== null || sceneBlockOkResolve !== null ||
    sceneHashFromBridgeResolve !== null || sceneUploadResultResolve !== null
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

async function readLoop(): Promise<void> {
  if (!reader || !port) return
  const decoder = new TextDecoder('utf-8', { fatal: false })
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value || value.length === 0) continue
      messageBuffer += decoder.decode(value, { stream: true })
      const lines = messageBuffer.split(/\r?\n/)
      messageBuffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.replace(/\r$/, '').trim()
        if (!trimmed) continue
        processLine(trimmed)
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'NetworkError') {
      console.error('Serial read error:', (err as Error).message)
    }
  } finally {
    resetScanWaiting()
    if (moduleInfoReject) moduleInfoReject(new Error('Connection closed'))
    if (setConfigReject) setConfigReject(new Error('Connection closed'))
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
  resetScanWaiting()
  if (moduleInfoReject) moduleInfoReject(new Error('Disconnected'))
  if (setConfigReject) setConfigReject(new Error('Disconnected'))
  setState('disconnected')
}

async function getModuleInfo(): Promise<ModuleInfo> {
  if (state !== 'connected' || !port?.writable) {
    throw new Error('DigiKey not connected')
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

function waitForSceneUploadReady(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      if (sceneUploadReadyResolve) {
        sceneUploadReadyResolve = null
        reject(new Error('SCENE_UPLOAD_READY timeout'))
      }
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
    sceneBlockOkExpectedIndex = expectedIndex
    sceneBlockOkTimeoutId = setTimeout(() => {
      sceneBlockOkTimeoutId = null
      if (sceneBlockOkResolve) {
        sceneBlockOkResolve = null
        sceneBlockOkReject = null
        sceneBlockOkExpectedIndex = null
        reject(new Error('SCENE_BLOCK_OK:' + expectedIndex + ' timeout'))
      }
    }, timeoutMs)
    sceneBlockOkResolve = () => {
      if (sceneBlockOkTimeoutId) clearTimeout(sceneBlockOkTimeoutId)
      sceneBlockOkTimeoutId = null
      sceneBlockOkResolve = null
      sceneBlockOkReject = null
      sceneBlockOkExpectedIndex = null
      resolve()
    }
    sceneBlockOkReject = (err: Error) => {
      if (sceneBlockOkTimeoutId) clearTimeout(sceneBlockOkTimeoutId)
      sceneBlockOkTimeoutId = null
      sceneBlockOkResolve = null
      sceneBlockOkReject = null
      sceneBlockOkExpectedIndex = null
      reject(err)
    }
  })
}

function waitForSceneHashFromBridge(timeoutMs: number): Promise<{ crc: string; hash: string }> {
  return new Promise((resolve, reject) => {
    sceneHashFromBridgeTimeoutId = setTimeout(() => {
      sceneHashFromBridgeTimeoutId = null
      if (sceneHashFromBridgeResolve) {
        sceneHashFromBridgeResolve = null
        reject(new Error('SCENE_HASH timeout'))
      }
    }, timeoutMs)
    sceneHashFromBridgeResolve = (obj) => {
      if (sceneHashFromBridgeTimeoutId) clearTimeout(sceneHashFromBridgeTimeoutId)
      sceneHashFromBridgeTimeoutId = null
      sceneHashFromBridgeResolve = null
      resolve(obj)
    }
  })
}

function waitForSceneUploadResult(timeoutMs: number): Promise<SceneUploadResult> {
  return new Promise((resolve, reject) => {
    sceneUploadResultTimeoutId = setTimeout(() => {
      sceneUploadResultTimeoutId = null
      if (sceneUploadResultResolve) {
        sceneUploadResultResolve = null
        reject(new Error('SCENE_UPLOAD_DONE timeout'))
      }
    }, timeoutMs)
    sceneUploadResultResolve = (result) => {
      if (sceneUploadResultTimeoutId) clearTimeout(sceneUploadResultTimeoutId)
      sceneUploadResultTimeoutId = null
      sceneUploadResultResolve = null
      resolve(result)
    }
  })
}

export type UploadLfpPhase = 1 | 2 | 3

export interface UploadLfpOptions {
  slot: 1 | 2
  onProgress?: (pct: number, phase?: UploadLfpPhase, rateKbPerS?: number) => void
}

async function uploadLfp(lfpBuffer: ArrayBuffer, options: UploadLfpOptions): Promise<void> {
  if (state !== 'connected' || !port?.writable) {
    throw new Error('DigiKey not connected')
  }
  if (uploadInProgress) throw new Error('Upload already in progress')
  uploadInProgress = true
  let phaseIntervalId: ReturnType<typeof setInterval> | null = null
  try {
    const { onProgress } = options
    const data = new Uint8Array(lfpBuffer)
    const totalSize = data.length
    if (totalSize === 0 || totalSize > 1024 * 1024) {
      throw new Error('Invalid file size')
    }
    const { totalMs, phase1Ms, phase2Ms, phase3Ms } = getUploadPhaseMs(totalSize)
    const hashBuf = await crypto.subtle.digest('SHA-256', data)
    const hashHex = bytesToHex(new Uint8Array(hashBuf)).toLowerCase()
    const numBlocks = Math.ceil(totalSize / LFP_BLOCK_SIZE)

    await sendMessage('SCENE_UPLOAD_START:' + totalSize)
    await waitForSceneUploadReady(SCENE_UPLOAD_READY_TIMEOUT_MS)

    const writer = port.writable.getWriter()
    const textEncoder = new TextEncoder()
    try {
      for (let i = 0; i < numBlocks; i++) {
        const blockStart = i * LFP_BLOCK_SIZE
        const blockEnd = Math.min(blockStart + LFP_BLOCK_SIZE, totalSize)
        const block = data.subarray(blockStart, blockEnd)
        const blockLen = block.length
        const crcHex = crc32BytesHex(block)
        const line = 'SCENE_BLOCK:' + i + ':' + blockLen + ':' + crcHex + '\n'
        await writer.write(textEncoder.encode(line))
        await writer.write(block)
        await waitForSceneBlockOk(i, SCENE_BLOCK_OK_TIMEOUT_MS)
        const pct = Math.round(((i + 1) / numBlocks) * (phase1Ms / totalMs) * 100)
        onProgress?.(Math.min(99, pct), 1)
      }
    } finally {
      writer.releaseLock()
    }

    await sendMessage('SCENE_GET_HASH')
    const hashResult = await waitForSceneHashFromBridge(SCENE_GET_HASH_TIMEOUT_MS)
    const fileCrcHex = crc32BytesHex(data)
    if (hashResult.crc.toLowerCase() !== fileCrcHex || hashResult.hash.toLowerCase() !== hashHex) {
      throw new Error('Bridge verify failed: crc/hash mismatch')
    }

    const phase1Pct = Math.round((phase1Ms / totalMs) * 100)
    onProgress?.(Math.min(99, phase1Pct), 1)

    const phase2RateKbPerS = phase2Ms > 0 ? (totalSize / 1024) / (phase2Ms / 1000) : 0
    const phase2Plus3Ms = phase2Ms + phase3Ms
    const phaseProgressStart = Date.now()
    phaseIntervalId = setInterval(() => {
      const elapsed = Date.now() - phaseProgressStart
      const phaseElapsed = Math.min(elapsed, phase2Plus3Ms)
      const pct = Math.round((phase1Ms + phaseElapsed) / totalMs * 100)
      const currentPhase: UploadLfpPhase = elapsed < phase2Ms ? 2 : 3
      const rate = currentPhase === 2 ? phase2RateKbPerS : undefined
      onProgress?.(Math.min(99, pct), currentPhase, rate)
    }, 200)

    await sendMessage('SCENE_SEND_TO_MODULE:' + hashHex)
    const result = await waitForSceneUploadResult(SCENE_SEND_TO_MODULE_TIMEOUT_MS)
    if (!result.ok) {
      throw new Error(result.msg ?? 'Module upload failed')
    }
    onProgress?.(100, 3)
  } finally {
    if (phaseIntervalId) clearInterval(phaseIntervalId)
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
