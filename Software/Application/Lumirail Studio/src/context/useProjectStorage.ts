import { useContext } from 'react'
import { ProjectStorageContext } from './projectStorageContext'

export function useProjectStorage() {
  const ctx = useContext(ProjectStorageContext)
  if (!ctx) {
    throw new Error('useProjectStorage must be used within ProjectStorageProvider')
  }
  return ctx
}
