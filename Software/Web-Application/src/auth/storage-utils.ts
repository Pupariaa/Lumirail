import type { StorageAdapter } from '../storage'
import type { User } from './types'
import { STORAGE_KEY_USERS } from './types'

export function loadUsers(adapter: StorageAdapter): User[] {
  const raw = adapter.getItem(STORAGE_KEY_USERS)
  if (!raw) return []
  try {
    return JSON.parse(raw) as User[]
  } catch {
    return []
  }
}

export function saveUsers(adapter: StorageAdapter, users: User[]): void {
  adapter.setItem(STORAGE_KEY_USERS, JSON.stringify(users))
}
