import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

const SPLASH_MIN_MS = 5000
const ASSET_TIMEOUT_MS = 8000

const SPLASH_LOG_LINES = [
  'preload mjs',
  'preload cjs',
  'serialbridge mjs',
  'importation node:path',
  'importation node:fs',
  'importation node:url',
  'importation serialbridge',
  'importation serialport',
  'importation contextbridge',
  'importation ipcRenderer',
  'chargement lit',
  'importation source auth',
  'importation source components',
  'importation source context',
  'importation source data',
  'importation source lfp encoder',
  'importation source lib',
  'importation source serial',
  "importation du chargeur d'amorçage scene builder",
  'chargement du scene builder',
  "importation du chargeur d'amorçage lfp transport",
  'chargement du lfp transport',
  'chargement des assets',
  'exécution applicative brcypt',
  'exécution applicative fabric',
  'exécution applicative react',
  'exécution applicative serialport',
  'importation fonts',
  'chargement des applications',
  'rendue des applications',
  'récurtion des projets locals',
  'chargement des projets locals',
  'chargement des scènes',
  "lancement de l'application",
] as const

function splashLogStepDelayMs(): number {
  return 100 + Math.floor(Math.random() * 201)
}

async function runSplashLogSequence(): Promise<void> {
  const host = document.getElementById('splash-log')
  if (!host) return
  for (const line of SPLASH_LOG_LINES) {
    await new Promise<void>((r) => setTimeout(r, splashLogStepDelayMs()))
    host.textContent = line
  }
}

async function preloadAssets(): Promise<void> {
  const splashImg = new Image()
  splashImg.src = '/assets/loader_animated.png'
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Asset timeout')), ASSET_TIMEOUT_MS)
    splashImg.onload = () => { clearTimeout(t); resolve() }
    splashImg.onerror = () => { clearTimeout(t); reject(new Error('Splash asset load failed')) }
  })
}

function hideSplash(): void {
  const el = document.getElementById('splash')
  if (el) {
    el.classList.add('hidden')
    setTimeout(() => el.remove(), 500)
  }
}

function setSplashVersion(): void {
  const v = import.meta.env.VITE_APP_VERSION
  const el = document.getElementById('splash-version')
  if (el && v) el.textContent = `v${v}`
}

const title = import.meta.env.VITE_APP_TITLE
if (title) document.title = title

setSplashVersion()

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

Promise.all([
  preloadAssets(),
  new Promise((r) => setTimeout(r, SPLASH_MIN_MS)),
  runSplashLogSequence(),
]).then(() => {
  hideSplash()
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}).catch((err) => {
  console.error('Splash bootstrap error:', (err as Error).message)
  hideSplash()
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
