import { hash } from 'bcryptjs'
import type { StorageAdapter } from '../storage'
import { validateEmail, validatePassword } from './validation'
import { loadUsers, saveUsers } from './storage-utils'

const SALT_ROUNDS = 10
const STORAGE_KEY_RESET_TOKENS = 'lumirail_reset_tokens'
const TOKEN_EXPIRY_HOURS = 24

interface ResetToken {
  token: string
  email: string
  expiresAt: string
}

function generateToken(): string {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')
}

function loadTokens(adapter: StorageAdapter): ResetToken[] {
  const raw = adapter.getItem(STORAGE_KEY_RESET_TOKENS)
  if (!raw) return []
  try {
    return JSON.parse(raw) as ResetToken[]
  } catch {
    return []
  }
}

function saveTokens(adapter: StorageAdapter, tokens: ResetToken[]): void {
  adapter.setItem(STORAGE_KEY_RESET_TOKENS, JSON.stringify(tokens))
}

export interface RequestResetResult {
  success: boolean
  resetLink?: string
  error?: string
}

export function requestPasswordReset(
  adapter: StorageAdapter,
  baseUrl: string,
  email: string
): RequestResetResult {
  const emailError = validateEmail(email)
  if (emailError) return { success: false, error: emailError }

  const users = loadUsers(adapter)
  const normalizedEmail = email.trim().toLowerCase()
  const user = users.find((u) => u.email.toLowerCase() === normalizedEmail)

  if (!user) {
    return { success: true }
  }

  const token = generateToken()
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString()
  const tokens = loadTokens(adapter).filter((t) => t.email !== normalizedEmail)
  tokens.push({ token, email: normalizedEmail, expiresAt })
  saveTokens(adapter, tokens)

  const resetLink = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${token}`
  return { success: true, resetLink }
}

export interface ResetPasswordResult {
  success: boolean
  error?: string
}

export async function resetPassword(
  adapter: StorageAdapter,
  token: string,
  newPassword: string,
  confirmPassword: string
): Promise<ResetPasswordResult> {
  const passwordError = validatePassword(newPassword)
  if (passwordError) return { success: false, error: passwordError }

  if (newPassword !== confirmPassword) {
    return { success: false, error: 'Passwords do not match' }
  }

  const tokens = loadTokens(adapter)
  const entry = tokens.find((t) => t.token === token)
  if (!entry) return { success: false, error: 'Invalid or expired reset link' }
  if (new Date(entry.expiresAt) < new Date()) {
    const valid = tokens.filter((t) => t.token !== token)
    saveTokens(adapter, valid)
    return { success: false, error: 'Reset link has expired' }
  }

  const users = loadUsers(adapter)
  const user = users.find((u) => u.email.toLowerCase() === entry.email)
  if (!user) {
    const valid = tokens.filter((t) => t.token !== token)
    saveTokens(adapter, valid)
    return { success: false, error: 'User no longer exists' }
  }

  const passwordHash = await hash(newPassword, SALT_ROUNDS)
  user.passwordHash = passwordHash
  saveUsers(adapter, users)

  const valid = tokens.filter((t) => t.token !== token)
  saveTokens(adapter, valid)

  return { success: true }
}

export function validateResetToken(adapter: StorageAdapter, token: string): boolean {
  const tokens = loadTokens(adapter)
  const entry = tokens.find((t) => t.token === token)
  if (!entry) return false
  if (new Date(entry.expiresAt) < new Date()) return false
  return true
}
