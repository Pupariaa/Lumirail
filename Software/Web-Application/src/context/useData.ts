import { useContext } from 'react'
import { DataContext } from './dataContext'

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
