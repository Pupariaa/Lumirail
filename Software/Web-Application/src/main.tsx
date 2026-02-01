import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

const title = import.meta.env.VITE_APP_TITLE
if (title) {
  document.title = title
}

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element #root not found')
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
