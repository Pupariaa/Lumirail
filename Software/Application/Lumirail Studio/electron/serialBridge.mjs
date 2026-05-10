import { SerialPort } from 'serialport'
import { BrowserWindow } from 'electron'

const ESPRESSIF_USB_VID = '303a'
const BAUD_RATE = 115200
const POLL_INTERVAL_MS = 2500
const INIT_DELAY_MS = 100
const SIGNALS_DELAY_MS = 200

let mainWindow = null
let serialPort = null
let pollTimer = null
let isConnecting = false

function getWin() {
  const wins = BrowserWindow.getAllWindows()
  return wins.length > 0 ? wins[0] : null
}

function send(channel, ...args) {
  const win = mainWindow || getWin()
  if (win && !win.isDestroyed() && win.webContents) {
    win.webContents.send(channel, ...args)
  }
}

function normalizeHex(s) {
  if (typeof s === 'number') return s.toString(16).padStart(4, '0').toLowerCase()
  if (typeof s !== 'string') return ''
  return s.trim().toLowerCase().replace(/^0x/, '')
}

function matchEspressifUsb(port) {
  const vid = normalizeHex(port.vendorId ?? '')
  if (vid === ESPRESSIF_USB_VID) return true
  const pnpId = (port.pnpId ?? '').toUpperCase().replace(/\\/g, '&')
  return pnpId.includes('VID_303A')
}

function closePort() {
  if (!serialPort) return
  const p = serialPort
  serialPort = null
  send('serial:disconnected')
  try {
    if (p.isOpen) p.close()
  } catch (_) {}
}

async function closePortAndWait() {
  if (!serialPort) return
  const p = serialPort
  serialPort = null
  send('serial:disconnected')
  if (p.isOpen) {
    try {
      await new Promise((resolve) => p.close(resolve))
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 400))
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function setupPortEvents(port) {
  port.on('data', (data) => {
    const buf = Buffer.from(data)
    send('serial:data', buf)
  })
  port.on('close', () => {
    serialPort = null
    send('serial:disconnected')
  })
  port.on('error', () => {
    if (serialPort) {
      try { serialPort.close() } catch (_) {}
      serialPort = null
    }
    send('serial:disconnected')
  })
}

async function openPort(path) {
  const port = new SerialPort({
    path,
    baudRate: BAUD_RATE,
    autoOpen: false,
  })
  await new Promise((resolve, reject) => {
    port.open((err) => (err ? reject(err) : resolve()))
  })
  await new Promise((r) => setTimeout(r, INIT_DELAY_MS))
  if (typeof port.set === 'function') {
    await new Promise((resolve, reject) => {
      port.set({ dtr: true, rts: false }, (err) => (err ? reject(err) : resolve()))
    })
    await new Promise((r) => setTimeout(r, SIGNALS_DELAY_MS))
  }
  setupPortEvents(port)
  serialPort = port
  send('serial:connected')
}

async function tryConnect() {
  if (serialPort?.isOpen || isConnecting) return
  isConnecting = true
  try {
    const ports = await SerialPort.list()
    const candidate = ports.find(matchEspressifUsb)
    if (!candidate) {
      isConnecting = false
      return
    }
    await openPort(candidate.path)
  } catch (_) {
  } finally {
    isConnecting = false
  }
}

function startPolling() {
  if (pollTimer) return
  tryConnect()
  pollTimer = setInterval(() => {
    if (serialPort?.isOpen) return
    tryConnect()
  }, POLL_INTERVAL_MS)
}

export async function listDigiKeyPorts() {
  const ports = await SerialPort.list()
  return ports.filter(matchEspressifUsb).map((p) => {
    const vid = normalizeHex(p.vendorId ?? '')
    const pid = normalizeHex(p.productId ?? '')
    const tag = vid && pid ? `${vid}:${pid}` : 'Espressif'
    const label = p.manufacturer ? `${p.manufacturer} (${tag})` : `Espressif USB (${tag})`
    return {
      path: p.path,
      portId: p.path,
      displayName: `${label} — ${p.path}`,
      portName: p.path,
    }
  })
}

export async function connectToPath(path) {
  if (serialPort?.isOpen && serialPort.path === path) return
  isConnecting = true
  try {
    await closePortAndWait()
    try {
      await openPort(path)
    } catch (err) {
      await new Promise((r) => setTimeout(r, 600))
      await openPort(path)
    }
  } catch (err) {
    send('serial:disconnected')
    throw err
  } finally {
    isConnecting = false
  }
}

export function startSerialBridge(win) {
  mainWindow = win
  startPolling()
  win.on('closed', () => {
    mainWindow = null
    closePort()
    stopPolling()
  })
}

export function setupSerialIpc(ipcMain) {
  ipcMain.handle('serial:listPorts', () => listDigiKeyPorts())
  ipcMain.handle('serial:connectTo', (_, path) => connectToPath(path))
  ipcMain.handle('serial:isConnected', () => {
    const ok = !!serialPort?.isOpen
    if (ok) send('serial:connected')
    return ok
  })
  ipcMain.handle('serial:write', async (_, buffer) => {
    if (!serialPort?.isOpen) return
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
    return new Promise((resolve, reject) => {
      serialPort.write(buf, (err) => (err ? reject(err) : resolve()))
    })
  })
  ipcMain.handle('serial:disconnect', () => closePort())
}
