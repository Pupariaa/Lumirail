import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

const SPLASH_MIN_MS = 5000
const ASSET_TIMEOUT_MS = 8000

async function preloadAssets(): Promise<void> {
  const logo = new Image()
  logo.src = '/assets/logo-lumirail.png'
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Asset timeout')), ASSET_TIMEOUT_MS)
    logo.onload = () => { clearTimeout(t); resolve() }
    logo.onerror = () => { clearTimeout(t); reject(new Error('Logo load failed')) }
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
