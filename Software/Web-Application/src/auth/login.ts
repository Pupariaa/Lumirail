import { compare } from 'bcryptjs'
import type { StorageAdapter } from '../storage'
import type { User } from './types'
import { validateEmail } from './validation'
import { loadUsers } from './storage-utils'
import { checkRateLimit, recordFailedAttempt, clearAttempts } from './rate-limit'

export interface LoginResult {
  success: boolean
  user?: User
  error?: string
}

export async function login(
  adapter: StorageAdapter,
  email: string,
  password: string
): Promise<LoginResult> {
  const rateLimitCheck = checkRateLimit()
  if (!rateLimitCheck.allowed) {
    return { success: false, error: rateLimitCheck.error }
  }

  const emailError = validateEmail(email)
  if (emailError) return { success: false, error: emailError }

  const users = loadUsers(adapter)
  const normalizedEmail = email.trim().toLowerCase()
  const user = users.find((u) => u.email.toLowerCase() === normalizedEmail)

  if (!user) {
    recordFailedAttempt()
    return { success: false, error: 'Invalid email or password' }
  }

  const match = await compare(password, user.passwordHash)
  if (!match) {
    recordFailedAttempt()
    return { success: false, error: 'Invalid email or password' }
  }

  clearAttempts()
  return { success: true, user }
}
