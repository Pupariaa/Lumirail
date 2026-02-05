import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promises as fs } from 'node:fs'
import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { startSerialBridge, setupSerialIpc } from './serialBridge.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const STORAGE_DIR = 'lumirail/data/users'

function sanitizeKey(key) {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_')
}

async function ensureStorageDir() {
  const userDataPath = app.getPath('userData')
  const dir = path.join(userDataPath, STORAGE_DIR)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function atomicWrite(filePath, data) {
  const tempPath = `${filePath}.tmp`
  await fs.writeFile(tempPath, data, 'utf8')
  await fs.rename(tempPath, filePath)
}

const MIN_WIDTH = 1212
const MIN_HEIGHT = 672

const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1'
const devUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:9000'

function createMainWindow() {
  const win = new BrowserWindow({
    width: Math.max(1400, MIN_WIDTH),
    height: Math.max(820, MIN_HEIGHT),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: '#11131a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  win.setMenuBarVisibility(false)
  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })
  setTimeout(() => { if (!win.isDestroyed() && !win.isVisible()) win.show() }, 5000)

  startSerialBridge(win)
  setupSerialIpc(ipcMain)

  if (isDev) {
    win.loadURL(devUrl)
    // win.webContents.openDevTools()
  } else {
    const indexHtml = pathToFileURL(path.join(app.getAppPath(), 'dist', 'index.html')).toString()
    win.loadURL(indexHtml)
  }

  return win
}

ipcMain.handle('storage:getItem', async (_, key) => {
  const dir = await ensureStorageDir()
  const sanitized = sanitizeKey(key)
  const filePath = path.join(dir, `${sanitized}.json`)
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
})

ipcMain.handle('storage:setItem', async (_, key, value) => {
  const dir = await ensureStorageDir()
  const sanitized = sanitizeKey(key)
  const filePath = path.join(dir, `${sanitized}.json`)
  await atomicWrite(filePath, value)
})

ipcMain.handle('storage:removeItem', async (_, key) => {
  const dir = await ensureStorageDir()
  const sanitized = sanitizeKey(key)
  const filePath = path.join(dir, `${sanitized}.json`)
  try {
    await fs.unlink(filePath)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
})

ipcMain.handle('storage:clear', async () => {
  const dir = await ensureStorageDir()
  const files = await fs.readdir(dir)
  const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))
  await Promise.all(jsonFiles.map((f) => fs.unlink(path.join(dir, f))))
})

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([]))
  } else {
    Menu.setApplicationMenu(null)
  }
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
