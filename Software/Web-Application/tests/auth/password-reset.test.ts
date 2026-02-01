import { describe, it, expect } from 'vitest'
import { requestPasswordReset, resetPassword, validateResetToken } from '../../src/auth/password-reset'
import { register } from '../../src/auth'
import type { StorageAdapter } from '../../src/storage'

const STORAGE_KEY_RESET_TOKENS = 'lumirail_reset_tokens'

function createMemoryAdapter(): StorageAdapter {
  const store = new Map<string, string>()
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}

describe('requestPasswordReset', () => {
  it('returns reset link when user exists', async () => {
    const adapter = createMemoryAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const result = requestPasswordReset(adapter, 'https://app.example.com', 'user@example.com')
    expect(result.success).toBe(true)
    expect(result.resetLink).toContain('/reset-password?token=')
  })

  it('returns success without link when user does not exist', () => {
    const adapter = createMemoryAdapter()
    const result = requestPasswordReset(adapter, 'https://app.example.com', 'unknown@example.com')
    expect(result.success).toBe(true)
    expect(result.resetLink).toBeUndefined()
  })
})

describe('resetPassword', () => {
  it('updates password and allows login with new password', async () => {
    const adapter = createMemoryAdapter()
    await register(adapter, 'user@example.com', 'oldPass123', 'oldPass123')
    const req = requestPasswordReset(adapter, 'https://app.example.com', 'user@example.com')
    const token = req.resetLink?.split('token=')[1]
    if (!token) throw new Error('expected token')

    const resetResult = await resetPassword(adapter, token, 'newPass456', 'newPass456')
    expect(resetResult.success).toBe(true)

    const { login } = await import('../../src/auth')
    const loginOld = await login(adapter, 'user@example.com', 'oldPass123')
    expect(loginOld.success).toBe(false)

    const loginNew = await login(adapter, 'user@example.com', 'newPass456')
    expect(loginNew.success).toBe(true)
  })

  it('rejects password mismatch', async () => {
    const adapter = createMemoryAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const req = requestPasswordReset(adapter, 'https://app.example.com', 'user@example.com')
    const token = req.resetLink?.split('token=')[1]
    if (!token) throw new Error('expected token')

    const result = await resetPassword(adapter, token, 'newPass456', 'different')
    expect(result.success).toBe(false)
  })

  it('rejects invalid token', async () => {
    const adapter = createMemoryAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const result = await resetPassword(adapter, 'invalid-token-xyz', 'newPass456', 'newPass456')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid or expired')
  })

  it('rejects expired token', async () => {
    const adapter = createMemoryAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const req = requestPasswordReset(adapter, 'https://app.example.com', 'user@example.com')
    const token = req.resetLink?.split('token=')[1]
    if (!token) throw new Error('expected token')
    const expiredToken = {
      token,
      email: 'user@example.com',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }
    adapter.setItem(STORAGE_KEY_RESET_TOKENS, JSON.stringify([expiredToken]))
    const result = await resetPassword(adapter, token, 'newPass456', 'newPass456')
    expect(result.success).toBe(false)
    expect(result.error).toContain('expired')
  })
})

describe('validateResetToken', () => {
  it('returns true for valid token', async () => {
    const adapter = createMemoryAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const req = requestPasswordReset(adapter, 'https://app.example.com', 'user@example.com')
    const token = req.resetLink?.split('token=')[1]
    if (!token) throw new Error('expected token')
    expect(validateResetToken(adapter, token)).toBe(true)
  })

  it('returns false for invalid token', () => {
    const adapter = createMemoryAdapter()
    expect(validateResetToken(adapter, 'invalid-token')).toBe(false)
  })

  it('returns false for expired token', async () => {
    const adapter = createMemoryAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const req = requestPasswordReset(adapter, 'https://app.example.com', 'user@example.com')
    const token = req.resetLink?.split('token=')[1]
    if (!token) throw new Error('expected token')
    const expiredToken = {
      token,
      email: 'user@example.com',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }
    adapter.setItem(STORAGE_KEY_RESET_TOKENS, JSON.stringify([expiredToken]))
    expect(validateResetToken(adapter, token)).toBe(false)
  })
})
