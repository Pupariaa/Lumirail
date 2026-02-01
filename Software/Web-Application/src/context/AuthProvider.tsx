import { useState, useCallback, type ReactNode } from 'react'
import type { User, SessionUser } from '../auth'
import { toSessionUser } from '../auth'
import { AuthContext } from './authContext'

const SESSION_STORAGE_KEY = 'lumirail_session'

function loadSession(): SessionUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

function saveSession(user: SessionUser | null): void {
  if (typeof window === 'undefined') return
  if (user) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user))
  } else {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(loadSession)

  const setUser = useCallback((u: User | null) => {
    const sessionUser = u ? toSessionUser(u) : null
    setUserState(sessionUser)
    saveSession(sessionUser)
  }, [])

  const logout = useCallback(() => {
    setUserState(null)
    saveSession(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
