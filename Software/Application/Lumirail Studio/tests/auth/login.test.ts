import { describe, it, expect, beforeEach } from 'vitest'
import { login } from '../../src/auth'
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

describe('login', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('succeeds with valid credentials', async () => {
    const adapter = createMemoryAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const result = await login(adapter, 'user@example.com', 'pass1234')
    expect(result.success).toBe(true)
    expect(result.user?.email).toBe('user@example.com')
  })

  it('fails with wrong password', async () => {
    const adapter = createMemoryAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const result = await login(adapter, 'user@example.com', 'wrongpass')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid')
  })

  it('fails with unknown email', async () => {
    const adapter = createMemoryAdapter()
    const result = await login(adapter, 'unknown@example.com', 'pass1234')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid')
  })

  it('clears failed attempts on successful login', async () => {
    const adapter = createMemoryAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')

    await login(adapter, 'user@example.com', 'wrongpass')
    await login(adapter, 'user@example.com', 'wrongpass')

    const result = await login(adapter, 'user@example.com', 'pass1234')
    expect(result.success).toBe(true)

    expect(localStorage.getItem('lumirail_login_attempts')).toBeNull()
  })

  describe('rate limiting', () => {
    it('blocks login after 5 failed attempts', async () => {
      const adapter = createMemoryAdapter()
      await register(adapter, 'user@example.com', 'pass1234', 'pass1234')

      for (let i = 0; i < 5; i++) {
        await login(adapter, 'user@example.com', 'wrongpass')
      }

      const result = await login(adapter, 'user@example.com', 'pass1234')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Too many failed attempts')
    })

    it('allows login after lockout period expires', async () => {
      const adapter = createMemoryAdapter()
      await register(adapter, 'user@example.com', 'pass1234', 'pass1234')

      const expiredRecord = {
        count: 5,
        lastAttempt: Date.now() - 20 * 60 * 1000,
        lockedUntil: Date.now() - 5 * 60 * 1000,
      }
      localStorage.setItem('lumirail_login_attempts', JSON.stringify(expiredRecord))

      const result = await login(adapter, 'user@example.com', 'pass1234')
      expect(result.success).toBe(true)
    })
  })
})
