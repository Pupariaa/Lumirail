import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version ?? '0.1.0'),
    'import.meta.env.VITE_DESKTOP': JSON.stringify(process.env.VITE_DESKTOP ?? '0'),
  },
  build: {
    target: ['chrome90', 'edge90', 'firefox90', 'safari15'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
})
