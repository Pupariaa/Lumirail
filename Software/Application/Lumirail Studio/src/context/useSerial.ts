import { useContext } from 'react'
import { SerialContext } from './serialContext'

export function useSerial() {
  const ctx = useContext(SerialContext)
  if (!ctx) {
    throw new Error('useSerial must be used within SerialProvider')
  }
  return ctx
}
