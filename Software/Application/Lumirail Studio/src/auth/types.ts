export interface User {
  id: string
  email: string
  passwordHash: string
  createdAt: string
}

export interface SessionUser {
  id: string
  email: string
  createdAt: string
}

export interface RegistrationResult {
  success: boolean
  user?: User
  error?: string
}

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  }
}

export const STORAGE_KEY_USERS = 'lumirail_users'
