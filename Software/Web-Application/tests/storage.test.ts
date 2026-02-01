import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createLocalStorageAdapter } from '../src/storage'

describe('createLocalStorageAdapter', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear()
    }
  })

  afterEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear()
    }
  })

  it('returns adapter with getItem, setItem, removeItem, clear', () => {
    const adapter = createLocalStorageAdapter()
    expect(adapter).toHaveProperty('getItem')
    expect(adapter).toHaveProperty('setItem')
    expect(adapter).toHaveProperty('removeItem')
    expect(adapter).toHaveProperty('clear')
  })

  it('persists and retrieves values', () => {
    const adapter = createLocalStorageAdapter()
    adapter.setItem('test-key', 'test-value')
    expect(adapter.getItem('test-key')).toBe('test-value')
  })

  it('removes item by key', () => {
    const adapter = createLocalStorageAdapter()
    adapter.setItem('test-key', 'test-value')
    adapter.removeItem('test-key')
    expect(adapter.getItem('test-key')).toBeNull()
  })

  it('clears all items', () => {
    const adapter = createLocalStorageAdapter()
    adapter.setItem('key1', 'value1')
    adapter.setItem('key2', 'value2')
    adapter.clear()
    expect(adapter.getItem('key1')).toBeNull()
    expect(adapter.getItem('key2')).toBeNull()
  })
})
