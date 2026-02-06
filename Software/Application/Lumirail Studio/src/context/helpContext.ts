import { createContext } from 'react'

export interface HelpContextValue {
  activeSectionId: string | null
  setActiveSectionId: (id: string | null) => void
}

export const HelpContext = createContext<HelpContextValue>({
  activeSectionId: null,
  setActiveSectionId: () => {},
})
