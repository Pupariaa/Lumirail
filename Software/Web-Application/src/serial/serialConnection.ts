import type { SerialConnectionState } from './types'

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

const SCAN_TIMEOUT_MS = 15000
const SCENE_READY_TIMEOUT_MS = 5000
const SCENE_SIZE_ACK_TIMEOUT_MS = 5000
const SCENE_DONE_TIMEOUT_MS = 8000
const SCENE_META_SET_TIMEOUT_MS = 5000
const SCENE_CHUNK = 64
const SCENE_CHUNK_DELAY_MS = 12

export function estimateUploadTimeMs(dataBytes: number): number {
  const chunks = Math.ceil(dataBytes / SCENE_CHUNK)
  return chunks * SCENE_CHUNK_DELAY_MS
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
}
