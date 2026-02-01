import { hash } from 'bcryptjs'
import type { StorageAdapter } from '../storage'
import type { User, RegistrationResult } from './types'
import { validateEmail, validatePassword } from './validation'
import { loadUsers, saveUsers } from './storage-utils'

const SALT_ROUNDS = 10

function generateId(): string {
  return crypto.randomUUID()
}

export async function register(
  adapter: StorageAdapter,
  email: string,
  password: string,
  confirmPassword: string
): Promise<RegistrationResult> {
  const emailError = validateEmail(email)
  if (emailError) return { success: false, error: emailError }

  const passwordError = validatePassword(password)
  if (passwordError) return { success: false, error: passwordError }

  if (password !== confirmPassword) {
    return { success: false, error: 'Passwords do not match' }
  }

  const users = loadUsers(adapter)
  const normalizedEmail = email.trim().toLowerCase()
  if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    return { success: false, error: 'An account with this email already exists' }
  }

  const passwordHash = await hash(password, SALT_ROUNDS)
  const user: User = {
    id: generateId(),
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date().toISOString(),
  }
  users.push(user)
  saveUsers(adapter, users)

  return { success: true, user }
}
