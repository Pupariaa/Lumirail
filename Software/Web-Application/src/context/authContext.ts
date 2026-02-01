import { createContext } from 'react'
import type { SessionUser, User } from '../auth'

export interface AuthContextValue {
  user: SessionUser | null
  setUser: (user: User | null) => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
