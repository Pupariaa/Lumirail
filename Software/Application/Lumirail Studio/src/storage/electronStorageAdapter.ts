import type { StorageAdapter } from './types'

declare global {
  interface Window {
    electronStorage?: {
      getItem: (key: string) => Promise<string | null>
      setItem: (key: string, value: string) => Promise<void>
      removeItem: (key: string) => Promise<void>
      clear: () => Promise<void>
    }
  }
}

const STORAGE_PREFIX = 'lumirail_userdata_'

export async function createElectronStorageAdapter(userId: string): Promise<StorageAdapter> {
  const es = typeof window !== 'undefined' ? window.electronStorage : undefined
  if (!es) {
    throw new Error('electronStorage not available')
  }

  const cache = new Map<string, string>()
  const primaryKey = `${STORAGE_PREFIX}${userId}`
  const value = await es.getItem(primaryKey)
  if (value !== null) cache.set(primaryKey, value)

  return {
    getItem: (key: string) => cache.get(key) ?? null,
    setItem: (key: string, value: string) => {
      cache.set(key, value)
      es.setItem(key, value).catch(() => {})
    },
    removeItem: (key: string) => {
      cache.delete(key)
      es.removeItem(key).catch(() => {})
    },
    clear: () => {
      cache.clear()
      es.clear().catch(() => {})
    },
  }
}
