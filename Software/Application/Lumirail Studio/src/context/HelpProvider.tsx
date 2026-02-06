import { useState, useCallback } from 'react'
import { HelpContext } from './helpContext'

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const value = {
    activeSectionId,
    setActiveSectionId: useCallback((id: string | null) => setActiveSectionId(id), []),
  }
  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>
}
