import type { StorageAdapter } from './types'

export function createLocalStorageAdapter(): StorageAdapter {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createInMemoryAdapter()
  }
  return {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
    clear: () => window.localStorage.clear(),
  }
}

function createInMemoryAdapter(): StorageAdapter {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}
