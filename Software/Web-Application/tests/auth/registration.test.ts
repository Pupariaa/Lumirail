import { describe, it, expect } from 'vitest'
import { register } from '../../src/auth'
import type { StorageAdapter } from '../../src/storage'

function createMemoryAdapter(): StorageAdapter {
  const store = new Map<string, string>()
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}

describe('register', () => {
  it('creates account with valid input', async () => {
    const adapter = createMemoryAdapter()
    const result = await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    expect(result.success).toBe(true)
    expect(result.user?.email).toBe('user@example.com')
    expect(result.user?.passwordHash).toBeDefined()
  })

  it('rejects password mismatch', async () => {
    const adapter = createMemoryAdapter()
    const result = await register(adapter, 'user@example.com', 'pass1234', 'different')
    expect(result.success).toBe(false)
    expect(result.error).toContain('match')
  })

  it('rejects duplicate email', async () => {
    const adapter = createMemoryAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const result = await register(adapter, 'user@example.com', 'other123', 'other123')
    expect(result.success).toBe(false)
    expect(result.error).toContain('already exists')
  })

  it('hashes password', async () => {
    const adapter = createMemoryAdapter()
    const result = await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    expect(result.user?.passwordHash).not.toBe('pass1234')
  })

  it('produces different hash for same password with different salt', async () => {
    const adapter1 = createMemoryAdapter()
    const adapter2 = createMemoryAdapter()
    const result1 = await register(adapter1, 'user1@example.com', 'pass1234', 'pass1234')
    const result2 = await register(adapter2, 'user2@example.com', 'pass1234', 'pass1234')
    expect(result1.user?.passwordHash).toBeDefined()
    expect(result2.user?.passwordHash).toBeDefined()
    expect(result1.user!.passwordHash).not.toBe(result2.user!.passwordHash)
  })

  it('rejects duplicate email case-insensitively', async () => {
    const adapter = createMemoryAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const result = await register(adapter, 'User@Example.COM', 'other123', 'other123')
    expect(result.success).toBe(false)
    expect(result.error).toContain('already exists')
  })
})
